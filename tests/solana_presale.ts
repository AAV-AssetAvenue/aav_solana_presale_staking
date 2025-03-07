import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolanaPresale } from "../target/types/solana_presale";
import { assert } from "chai";
import { BN } from "bn.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo,transfer } from "@solana/spl-token";

async function confirmTransaction(tx:string) {
  const latestBlockHash = await anchor.getProvider().connection.getLatestBlockhash();
  await anchor.getProvider().connection.confirmTransaction({
    blockhash: latestBlockHash.blockhash,
    lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
    signature: tx,
  });
}

async function airdropSol(publicKey:anchor.web3.PublicKey, amount:number) {
let airdropTx = await anchor.getProvider().connection.requestAirdrop(publicKey, amount);
await confirmTransaction(airdropTx);
}

type userData = {
  totalStakingBalance: anchor.BN;
  stakeDate: anchor.BN;
  isFirstTime: boolean;
}
type stakingInfo= {
  tokenMint: anchor.web3.PublicKey;
  totalTokensStaked: anchor.BN;
  totalTokensRewarded: anchor.BN;
  stakingStartDate: anchor.BN;
  allowClaiming: boolean;
  authority: anchor.web3.PublicKey;
}
const PRECISION = 1_000_000; 
const MONTH_DURATION = (30 * 24 * 60 * 60) * PRECISION;
const DAY_DURATION = (24 * 60 * 60) * PRECISION;
const DAILY_REWARDS = [
  12671000000, 13014000000, 13356000000, 13699000000, 14041000000, 14384000000, 14726000000, 15068000000, 15411000000, 15753000000, 16096000000, 16438000000
];
const calculateAccumulatedRewards = (userData:userData,stakingInfo:stakingInfo):number => {
  const stakedAmount = userData.totalStakingBalance.toNumber();
  const totalStaked = stakingInfo.totalTokensStaked.toNumber();
  const userShare = (stakedAmount * PRECISION) / totalStaked;
  
  const time_diff = (Math.floor(Date.now()/1000) - userData.stakeDate.toNumber()) * PRECISION;
  console.log("time_diff",time_diff)
  const stakingStartDate = stakingInfo.stakingStartDate.toNumber();

  const stakeDurationDays = ((time_diff + (DAY_DURATION / 2)) / DAY_DURATION);


  let rewardAccumulated = 0;
  let remainingDays = stakeDurationDays;
  let currentMonth = (((userData.stakeDate.toNumber() - stakingStartDate) * PRECISION + (MONTH_DURATION/2) )/MONTH_DURATION);
   currentMonth = Math.floor(currentMonth); 
  console.log("currentMonth",currentMonth)
  while (remainingDays > 0 && currentMonth < DAILY_REWARDS.length) {
    const dailyReward = DAILY_REWARDS[currentMonth];
    let daysInMonth = Math.min(remainingDays, 30);
    daysInMonth = Math.floor(daysInMonth);
    rewardAccumulated += (userShare * dailyReward * daysInMonth)/PRECISION;
    
    remainingDays -= daysInMonth;
    currentMonth += 1;
  }
  // Ensure minimum 1-day reward if stake_duration_days > 0 but reward_accumulated is 0
  if (stakeDurationDays >= 1 && rewardAccumulated == 0) {
    let daily_reward = DAILY_REWARDS[0]; // Use first month's reward rate
    let min_reward = (userShare * daily_reward) / PRECISION;
    rewardAccumulated = min_reward;
  }
  return rewardAccumulated;
};

async function getSolBalance(pg:Program<SolanaPresale>,address:anchor.web3.PublicKey):Promise<number>{
  let initialBalance: number;
  try {   
    const balance = (await pg.provider.connection.getBalance(address))
    initialBalance = balance;
  } catch {
    // Token account not yet initiated has 0 balance
    initialBalance = 0;
  } 
  return initialBalance;
}

describe("solana presale testcases", async() => {
  

  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.SolanaPresale as Program<SolanaPresale>;
  



  const DATA_SEED = "my_data";
  const PRESALE_SEED = "solana_presale";
  const STAKING_SEED = "solana_staking";
  const DATA_SEED_STAKING = "staking_user_data";
  const account1 = program.provider.publicKey
  const account2 = anchor.web3.Keypair.generate()
  const account3 = anchor.web3.Keypair.generate()
  const account4 = anchor.web3.Keypair.generate()


  const payer = account2


  let usdc 
  let token
  let presale_usdc_ata
  let staking_ata
  let totalTokenStaked = 0;
  let presale_ata

  const account2Investment= new anchor.BN(0.5e9) // sol
  const account2UsdcInvestment= new anchor.BN(100e6) // usdc
  const date = Math.floor(new Date().getTime()/1000)
  
  const [presalePda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from(PRESALE_SEED)],
    program.programId
  );

  const [stakingPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from(STAKING_SEED)],
    program.programId
  );

const stakingReward = 100000000000000;
  before(async()=>{
    await airdropSol(account2.publicKey, 20*1e9); // 20 SOL
    await airdropSol(account3.publicKey, 20*1e9); // 20 SOL
    await airdropSol(account4.publicKey, 20*1e9); // 20 SOL

    usdc = await createMint(
      program.provider.connection,
      payer,
      payer.publicKey,
      null,
      6,
      anchor.web3.Keypair.generate(),
      {},
      anchor.utils.token.TOKEN_PROGRAM_ID,
    );
    token = await createMint(
      program.provider.connection,
      payer,
      payer.publicKey,
      null,
      5,
      anchor.web3.Keypair.generate(),
      {},
      anchor.utils.token.TOKEN_PROGRAM_ID,
    );

    const usdcTokenAccount = await getOrCreateAssociatedTokenAccount(
      program.provider.connection,
      payer,
      usdc,  // The mint address
      payer.publicKey // Owner of the token account
    );


    await mintTo(
     program.provider.connection,
     payer,
     usdc,
     usdcTokenAccount.address,
     payer.publicKey,
     10000000000,
      [],
     {},
     anchor.utils.token.TOKEN_PROGRAM_ID,
    )    
  

    const aavTokenAccount = await getOrCreateAssociatedTokenAccount(
      program.provider.connection,
      payer,
      token,  // The mint address
      payer.publicKey // Owner of the token account
    );
    await mintTo(
     program.provider.connection,
     payer,
     token,
     aavTokenAccount.address,
     payer.publicKey,
     500000000000000,
      [],
     {},
     anchor.utils.token.TOKEN_PROGRAM_ID,
    )    
  
    presale_ata = anchor.utils.token.associatedAddress({
      mint: token,
      owner: presalePda,
    });
    staking_ata = await getOrCreateAssociatedTokenAccount(
      program.provider.connection,
      payer,
      token,
      stakingPda,
      true
  );
  })

  it("initializer", async () => {
    presale_usdc_ata = await getOrCreateAssociatedTokenAccount(
      program.provider.connection,
      payer,
      usdc,
      presalePda,
      true
  );
    const presale_ata = await getOrCreateAssociatedTokenAccount(
      program.provider.connection,
      payer,
      token,  // The mint address
      presalePda, // Owner of the token account
      true
    );
    const startPresaleContext = {
      signer:account1,
      presale:presalePda,
      staking:stakingPda,
      tokenMint:token,
      usdcMint:usdc,
      presaleUsdcAccount:presale_usdc_ata.address,
      stakingTokenAccount:staking_ata.address,
      presaleTokenAccount:presale_ata.address,
      systemProgram: anchor.web3.SystemProgram.programId,
      tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
      
    }

    // Add your test here.
    await program.methods.initializer(
      new BN(date), // startTime
      new BN(368664), // pricePerTokenInSol
      new BN(79067) // pricePerTokenInUsdc
    )        
    .accounts(startPresaleContext)
    .rpc();



    const data = await program.account.presaleInfo.fetch(presalePda)
    assert.equal(date,Number(data.startTime));
    assert.equal(368664,Number(data.pricePerTokenInSol));
    assert.equal(79067,Number(data.pricePerTokenInUsdc));
    assert.equal(true,data.isLive);
    assert.equal(true,data.isInitialized);




 


  });


  it("transfer tokens to presale", async () => {
    const transferAmount = 400000000000000
    const from_ata = await getOrCreateAssociatedTokenAccount(
      program.provider.connection,
      payer,
      token,  // The mint address
      account2.publicKey, // Owner of the token account
      true
    );
    const ownerBalance = (await program.provider.connection.getTokenAccountBalance(from_ata.address))
    console.log("ownerBalance",ownerBalance)

    const receiverATA = anchor.utils.token.associatedAddress({
      mint: token,
      owner: presalePda,
    });
    const staking_receiverATA = anchor.utils.token.associatedAddress({
      mint: token,
      owner: stakingPda,
    });
/**
 *  //   from:account1,
    //   to:presalePda,
    //   fromAta:from_ata,
    //   toAta:reciever_ata,
    //   mint:token,
 */
    await transfer(
      program.provider.connection, 
      payer, 
      from_ata.address,    // Sender (must sign)
      receiverATA,  // Receiver (PDA cannot sign)
      account2.publicKey,    // Explicitly adding sender as a signer
      transferAmount, 
      [account2]   // Ensure the sender signs the transaction
  );    
    await transfer(
      program.provider.connection, 
      payer, 
      from_ata.address,    // Sender (must sign)
      staking_receiverATA,  // Receiver (PDA cannot sign)
      account2.publicKey,    // Explicitly adding sender as a signer
      stakingReward, 
      [account2]   // Ensure the sender signs the transaction
  );    
  const userUsdcTokenAccount = anchor.utils.token.associatedAddress({
    mint: usdc,
    owner: account2.publicKey,
  });
  const account4_usdcTokenAccount = await getOrCreateAssociatedTokenAccount(
    program.provider.connection,
    payer,
    usdc,  // The mint address
    account4.publicKey // Owner of the token account
  );
  await transfer(
    program.provider.connection, 
    payer, 
    userUsdcTokenAccount,    // Sender (must sign)
    account4_usdcTokenAccount.address,  // Receiver (PDA cannot sign)
    account2.publicKey,    // Explicitly adding sender as a signer
    1000000000, 
    [account2]   // Ensure the sender signs the transaction
);    

  
  const presaleBalance = (await program.provider.connection.getTokenAccountBalance(receiverATA))
    console.log("presaleBalance",presaleBalance)

  });

  it("invest using sol",async()=>{
    const [dataPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from(DATA_SEED),account2.publicKey.toBuffer()],
      program.programId
    );
   
    const reciever_ata  = anchor.utils.token.associatedAddress({
      mint: token,
      owner: account2.publicKey,
    });
  
    const userUsdcTokenAccount = anchor.utils.token.associatedAddress({
      mint: usdc,
      owner: account2.publicKey,
    });
    
  
  const presaleBalance = (await program.provider.connection.getTokenAccountBalance(presale_ata))
  console.log("presaleBalance",presaleBalance)

    const context = {
      data:dataPda,
      from:account2.publicKey,
      signer:account2.publicKey,
      presale:presalePda,
      investor_usdc_account:userUsdcTokenAccount,
      presaleUsdcAccount:presale_usdc_ata.address,
      usdcMint:usdc,
      presaleTokenAccount:presale_ata,
      tokenMint:token,
      signerTokenAccount:reciever_ata,
      systemProgram: anchor.web3.SystemProgram.programId,
      tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
    }
    const beforeBalance = await getSolBalance(program,account2.publicKey)
console.log("beforeBalance",beforeBalance)
const investAmount = 0.5*1e9;
    // Add your test here.
    await program.methods.invest(new anchor.BN(investAmount),0)        
    .accounts(context)
    .signers([account2])
    .rpc();
    
    const afterPresaleBalance = (await program.provider.connection.getTokenAccountBalance(presale_ata))
    let solBalance = await program.account.presaleInfo.fetch(presalePda)
    assert.equal(Number(solBalance.solAmountRaised),investAmount);
    const data = await program.account.investmentData.fetch(dataPda)
    const balance = (await program.provider.connection.getTokenAccountBalance(reciever_ata))
    assert.equal(Number(balance.value.amount),Number(data.numberOfTokens))
    assert.equal(Number(presaleBalance.value.amount)-Number(data.numberOfTokens),Number(afterPresaleBalance.value.amount))
    assert.equal(Number(account2Investment),Number(data.solInvestmentAmount))
  })

  it("invest using usdc",async()=>{
    const [dataPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from(DATA_SEED),account2.publicKey.toBuffer()],
      program.programId
    );
   
    const reciever_ata = anchor.utils.token.associatedAddress({
      mint: token,
      owner: account2.publicKey,
    });

  const userUsdcTokenAccount = anchor.utils.token.associatedAddress({
    mint: usdc,
    owner: account2.publicKey,
  });
  
    const context = {
      data:dataPda,
      from:account2.publicKey,
      signer:account2.publicKey,
      presale:presalePda,
      investor_usdc_account:userUsdcTokenAccount,
      presaleUsdcAccount:presale_usdc_ata.address,
      usdcMint:usdc,
      presaleTokenAccount:presale_ata,
      tokenMint:token,
      signerTokenAccount:reciever_ata,
      systemProgram: anchor.web3.SystemProgram.programId,
      tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
    }

    // Add your test here.
    
    await program.methods.invest(account2UsdcInvestment,1)        
    .accounts(context)
    .signers([account2])
    .rpc();
    
    // const afterPresaleBalance = (await program.provider.connection.getTokenAccountBalance(presale_ata))
    // // let solBalance = await program.account.presaleInfo.fetch(presalePda)
    // // assert.equal(Number(solBalance.amountRaised),2*1e9);
    // const data = await program.account.investmentData.fetch(dataPda)
    // const presaleData = await program.account.presaleInfo.fetch(presalePda)
    // const balance = (await program.provider.connection.getTokenAccountBalance(reciever_ata))
    // assert.equal(Number(balance.value.amount),Number(data.numberOfTokens))
    // // assert.equal(Number(mintAmount* 10 ** metadata.decimals)-Number(presaleData.totalTokensSold),Number(afterPresaleBalance.value.amount))
    // assert.equal(Number(account2UsdcInvestment),Number(data.usdcInvestmentAmount))
  })
 


it("buy with sol and stake",async()=>{
 
  const userUsdcTokenAccount = anchor.utils.token.associatedAddress({
    mint: usdc,
    owner: account2.publicKey,
  });

  const [dataPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from(DATA_SEED),account2.publicKey.toBuffer()],
        program.programId
      );
      
  const [stakingDataPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from(DATA_SEED_STAKING),account2.publicKey.toBuffer()],
        program.programId
      );
     
      const reciever_ata = anchor.utils.token.associatedAddress({
        mint: token,
        owner: account2.publicKey,
      });


      const staking_ata = anchor.utils.token.associatedAddress({
        mint: token,
        owner: stakingPda,
      });
  

      const context = {
        investmentData:dataPda,
        stakingData:stakingDataPda,
        presale:presalePda,
        staking:stakingPda,
        from:account2.publicKey,
        signer:account2.publicKey,
        tokenMint:token,
        presaleTokenAccount:presale_ata,
        stakingTokenAccount:staking_ata,
        usdcMint:usdc,
        presaleUsdcAccount:presale_usdc_ata.address,
        signerUsdAccount:userUsdcTokenAccount,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
      }
      // Add your test here.
      await program.methods.buyAndStake(account2Investment,0)        
      .accounts(context)
      .signers([account2])

      .rpc(); 
      const presaleData = await program.account.presaleInfo.fetch(presalePda)
      const userData = await program.account.stakingData.fetch(stakingDataPda);
      const stakingData = await program.account.stakingInfo.fetch(stakingPda);
      const data = await program.account.investmentData.fetch(dataPda)

      totalTokenStaked += Math.floor(Number(account2Investment)*100000/Number(presaleData.pricePerTokenInSol));

      assert.equal(Number(stakingData.totalTokensStaked),totalTokenStaked);

       assert.equal(userData.isFirstTime,true);

       const afterStakingBalance = (await program.provider.connection.getTokenAccountBalance(staking_ata))

       assert.equal(Number(afterStakingBalance.value.amount),totalTokenStaked+stakingReward)
})



it("buy with usdc and stake",async()=>{
 

const userUsdcTokenAccount = anchor.utils.token.associatedAddress({
  mint: usdc,
  owner: account2.publicKey,
});

  const [dataPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from(DATA_SEED),account2.publicKey.toBuffer()],
        program.programId
      );
      
  const [stakingDataPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from(DATA_SEED_STAKING),account2.publicKey.toBuffer()],
        program.programId
      );
     
      const reciever_ata = anchor.utils.token.associatedAddress({
        mint: token,
        owner: account2.publicKey,
      });


      const staking_ata = anchor.utils.token.associatedAddress({
        mint: token,
        owner: stakingPda,
      });
  
    
      const context = {
        investmentData:dataPda,
        stakingData:stakingDataPda,
        presale:presalePda,
        staking:stakingPda,
        from:account2.publicKey,
        signer:account2.publicKey,
        tokenMint:token,
        presaleTokenAccount:presale_ata,
        stakingTokenAccount:staking_ata,
        usdcMint:usdc,
        presaleUsdcAccount:presale_usdc_ata.address,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
      }
      // Add your test here.
      await program.methods.buyAndStake(account2UsdcInvestment,1)        
      .accounts(context)
      .signers([account2])

      .rpc(); 

      const presaleData = await program.account.presaleInfo.fetch(presalePda)

       const userData = await program.account.stakingData.fetch(stakingDataPda);
       const stakingData = await program.account.stakingInfo.fetch(stakingPda);
       totalTokenStaked += Math.floor(Number(account2UsdcInvestment)*100000/Number(presaleData.pricePerTokenInUsdc));

       assert.equal(Number(stakingData.totalTokensStaked),totalTokenStaked);
       assert.equal(userData.isFirstTime,true);
       const afterStakingBalance = (await program.provider.connection.getTokenAccountBalance(staking_ata))

       assert.equal(Number(afterStakingBalance.value.amount),totalTokenStaked+stakingReward)
})


it("invest using sol with new account ",async()=>{

  const [dataPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from(DATA_SEED),account3.publicKey.toBuffer()],
    program.programId
  );
 
  const reciever_ata  = await getOrCreateAssociatedTokenAccount(
    program.provider.connection,
    payer,
    token,  // The mint address
    account3.publicKey // Owner of the token account
  );
  const userUsdcTokenAccount = await getOrCreateAssociatedTokenAccount(
    program.provider.connection,
    payer,
    usdc,  // The mint address
    account3.publicKey // Owner of the token account
  );

const presaleBalance = (await program.provider.connection.getTokenAccountBalance(presale_ata))
console.log("presaleBalance",presaleBalance)

  const context = {
    data:dataPda,
    from:account3.publicKey,
    signer:account3.publicKey,
    presale:presalePda,
    investor_usdc_account:userUsdcTokenAccount,
    presaleUsdcAccount:presale_usdc_ata.address,
    usdcMint:usdc,
    presaleTokenAccount:presale_ata,
    tokenMint:token,
    signerTokenAccount:reciever_ata.address,
    systemProgram: anchor.web3.SystemProgram.programId,
    tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
    associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
  }
  const beforeBalance = await getSolBalance(program,account3.publicKey)
console.log("beforeBalance",beforeBalance)
const investAmount = 0.5*1e9;
  // Add your test here.
  await program.methods.invest(new anchor.BN(investAmount),0)        
  .accounts(context)
  .signers([account3])
  .rpc();
  
  const afterPresaleBalance = (await program.provider.connection.getTokenAccountBalance(presale_ata))
  const data = await program.account.investmentData.fetch(dataPda)
  const balance = (await program.provider.connection.getTokenAccountBalance(reciever_ata.address))
  assert.equal(Number(balance.value.amount),Number(data.numberOfTokens))
  assert.equal(Number(presaleBalance.value.amount)-Number(data.numberOfTokens),Number(afterPresaleBalance.value.amount))
  assert.equal(Number(account2Investment),Number(data.solInvestmentAmount))
})

it("invest using usdc with new account ",async()=>{
  const [dataPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from(DATA_SEED),account4.publicKey.toBuffer()],
    program.programId
  );
 
  const reciever_ata = anchor.utils.token.associatedAddress({
    mint: token,
    owner: account4.publicKey,
  });

const userUsdcTokenAccount = anchor.utils.token.associatedAddress({
  mint: usdc,
  owner: account4.publicKey,
});

  const context = {
    data:dataPda,
    from:account4.publicKey,
    signer:account4.publicKey,
    presale:presalePda,
    investor_usdc_account:userUsdcTokenAccount,
    presaleUsdcAccount:presale_usdc_ata.address,
    usdcMint:usdc,
    presaleTokenAccount:presale_ata,
    tokenMint:token,
    signerTokenAccount:reciever_ata,
    systemProgram: anchor.web3.SystemProgram.programId,
    tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
    associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
  }

  // Add your test here.
  
  await program.methods.invest(account2UsdcInvestment,1)        
  .accounts(context)
  .signers([account4])
  .rpc();
  
  // const afterPresaleBalance = (await program.provider.connection.getTokenAccountBalance(presale_ata))
  // // let solBalance = await program.account.presaleInfo.fetch(presalePda)
  // // assert.equal(Number(solBalance.amountRaised),2*1e9);
  // const data = await program.account.investmentData.fetch(dataPda)
  // const presaleData = await program.account.presaleInfo.fetch(presalePda)
  // const balance = (await program.provider.connection.getTokenAccountBalance(reciever_ata))
  // assert.equal(Number(balance.value.amount),Number(data.numberOfTokens))
  // // assert.equal(Number(mintAmount* 10 ** metadata.decimals)-Number(presaleData.totalTokensSold),Number(afterPresaleBalance.value.amount))
  // assert.equal(Number(account2UsdcInvestment),Number(data.usdcInvestmentAmount))
})


  it("withdraw sol",async()=>{
    const newAuthority = account2.publicKey
    const context = {
      presale:presalePda,
      staking:stakingPda,
      signer:account1
    };

     await program.methods
      .updateAuthority(account2.publicKey)
      .accounts(context)
      .rpc();
   /**
    * 
 signer
 presale
 presaleUsdcAccount
 signerUsdcAccount
 usdcMint
 systemProgram
 tokenProgram
 associatedTokenProgram
    */

const userUsdcTokenAccount = await getOrCreateAssociatedTokenAccount(
  program.provider.connection,
  payer,
  usdc,  // The mint address
  newAuthority // Owner of the token account
);
    const startPresaleContext = {
      
      signer:newAuthority,
      presale:presalePda,
      presaleUsdcAccount:presale_usdc_ata.address,
      signerUsdAccount:userUsdcTokenAccount.address,
      usdcMint:usdc,
      systemProgram: anchor.web3.SystemProgram.programId,
      tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
    }
    const beforeBalance = await getSolBalance(program,newAuthority)
    await program.methods.adminWithdrawUsdcAndSol()        
    .accounts(startPresaleContext)
    .signers([account2])

    .rpc();
    const afterBalance = await getSolBalance(program,newAuthority)
    const rentExemption = await program.provider.connection.getMinimumBalanceForRentExemption(program.account.presaleInfo.size)
    assert.isTrue(afterBalance > beforeBalance+Number(account2Investment) - rentExemption);
  })








  it("toggle Presale", async () => {


    const context = {
      presale:presalePda,
      signer:account2.publicKey
    };

     await program.methods
      .togglePresale(false)
      .accounts(context)
      .signers([account2])
      .rpc();
      const data = await program.account.presaleInfo.fetch(presalePda)
      assert.equal(data.isLive,false)

  });


  it("stake",async()=>{

    
    const STAKING_DATA_SEED = "staking_user_data";
     const [dataPda] = anchor.web3.PublicKey.findProgramAddressSync(
           [Buffer.from(STAKING_DATA_SEED),account1.toBuffer()],
           program.programId
         );
        
         const signer_ata =  await getOrCreateAssociatedTokenAccount(
          program.provider.connection,
          payer,
          token,  // The mint address
          account1 // Owner of the token account
        );
        const account2_ata = anchor.utils.token.associatedAddress({
          mint: token,
          owner: account2.publicKey,
        });
         const staking_ata = anchor.utils.token.associatedAddress({
           mint: token,
           owner: stakingPda,
         });
         const stakingAmount= 2e5 // 2 tokens
         await transfer(
          program.provider.connection, 
          payer, 
          account2_ata,    // Sender (must sign)
          signer_ata.address,  // Receiver (PDA cannot sign)
          account2.publicKey,    // Explicitly adding sender as a signer
          stakingAmount, 
          [account2]   // Ensure the sender signs the transaction
      );    

         const context = {
          from:account1,
           stakingData:dataPda,
           staking:stakingPda,
           stakingTokenAccount:staking_ata,
           signerTokenAccount:signer_ata.address,
           signer:account1,
           tokenMint:token,
           tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
           systemProgram: anchor.web3.SystemProgram.programId,
           associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
         }
     
         // Add your test here.
         await program.methods.stake(new BN(2e5))        
         .accounts(context)
         .rpc(); 
  
         
          const userData = await program.account.stakingData.fetch(dataPda);
          assert.equal(userData.isFirstTime,true);
  })
  
  
  
  
  it("unstake_and_claim_rewards",async()=>{
    const STAKING_DATA_SEED = "staking_user_data";

    try{
    const context1 = {
      signer:account2.publicKey,
      staking:stakingPda,
    }
    // Add your test here.
    await program.methods.allowClaiming(true)        
    .accounts(context1)
    .signers([account2])
    .rpc();
  
  
     const [dataPda] = anchor.web3.PublicKey.findProgramAddressSync(
           [Buffer.from(STAKING_DATA_SEED),account1.toBuffer()],
           program.programId
         );
        
         const reciever_ata = anchor.utils.token.associatedAddress({
           mint: token,
           owner: account1,
         });
  
  
    
  
  
         const staking_ata = anchor.utils.token.associatedAddress({
           mint: token,
           owner: stakingPda,
         });
     
       
         const context = {
             stakingData:dataPda,
          from:account1,
           staking:stakingPda,
           stakingTokenAccount:staking_ata,
           signerTokenAccount:reciever_ata,
           signer:account1,
           tokenMint:token,
           tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
           systemProgram: anchor.web3.SystemProgram.programId,
           associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
         }
         const beforeBalance = (await program.provider.connection.getTokenAccountBalance(reciever_ata))
         
         const userData = await program.account.stakingData.fetch(dataPda);
         const stakingInfo = await program.account.stakingInfo.fetch(stakingPda);
      
         const rewards = calculateAccumulatedRewards(userData,stakingInfo);
         console.log("rewards--",rewards);
         // Add your test here.
         await program.methods.unstakeAndClaimRewards()        
         .accounts(context)
         .rpc(); 
         const afterBalance = (await program.provider.connection.getTokenAccountBalance(reciever_ata))
         console.log("beforeBalance",beforeBalance.value.uiAmount)
      console.log("afterBalance",afterBalance.value.uiAmount)
  
  
  
            //  assert.equal(Number(afterBalance.value.amount),Number(beforeBalance.value.amount)+stakingAmount.toNumber()+reward);
        }catch(e) {
        if (e instanceof anchor.AnchorError){
          assert(e.message.includes("NoRewards"))
            }else{
              assert(false);
            }
        }
  })

  it("withdraw tokens",async()=>{
    

    const reciever_ata = await getOrCreateAssociatedTokenAccount(
      program.provider.connection,
      payer,
      token,  // The mint address
      account2.publicKey // Owner of the token account
    );
    const presale_ata = anchor.utils.token.associatedAddress({
      mint: token,
      owner: presalePda,
    });

    const context = {
      presaleTokenAccount:presale_ata,
      stakingTokenAccount:staking_ata.address,
      signerTokenAccount:reciever_ata.address,
      presale:presalePda,
      signer:account2.publicKey,
      tokenMint:token,
      tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
      associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
    }

    // Add your test here.
    await program.methods.adminWithdrawTokens()        
    .accounts(context)
    .signers([account2])
    .rpc();
    await program.methods.adminWithdrawStakingTokens()        
    .accounts(context)
    .signers([account2])
    .rpc();
    const balance = (await program.provider.connection.getTokenAccountBalance(reciever_ata.address))
    const presaleBalance = (await program.provider.connection.getTokenAccountBalance(presale_ata))
    const data = await program.account.presaleInfo.fetch(presalePda)
    const stakingInfo = await program.account.stakingInfo.fetch(stakingPda);
    // assert.equal(Number(balance.value.amount),Number(mintAmount* 10 ** metadata.decimals - Number(data.totalTokensSold) + Number(stakingInfo.totalTokensStaked)))
    assert.equal(Number(presaleBalance.value.amount),Number(0))
  })

 
});
