import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolanaPresale } from "../target/types/solana_presale";
import { assert } from "chai";
import { BN } from "bn.js";
import { SolanaSpl } from "../target/types/solana_spl";
import { createAccount, createAssociatedTokenAccount, createMint, getAccount, getAssociatedTokenAddress, getOrCreateAssociatedTokenAccount, mintTo,transfer } from "@solana/spl-token";

const sleep = (s: number) => new Promise(resolve => setTimeout(resolve, s*1000));
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
  const token = anchor.workspace.SolanaSpl as Program<SolanaSpl>;
  const TOKEN_METADATA_PROGRAM_ID = new anchor.web3.PublicKey(
    "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s" // metaplex metadata program id
  )
  const metadata = {
    name: "lamport Token",
    symbol: "LMT",
    uri: "https://pump.mypinata.cloud/ipfs/QmeSzchzEPqCU1jwTnsipwcBAeH7S4bmVvFGfF65iA1BY1?img-width=128&img-dpr=2&img-onerror=redirect",
    decimals: 5,
  };
  const MINT_SEED = "token-mint";
  const DATA_SEED = "my_data";
  const PRESALE_SEED = "solana_presale";
  const STAKING_SEED = "solana_staking";
  const DATA_SEED_STAKING = "staking_user_data";

  
  const [mint] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from(MINT_SEED)],
    token.programId
  );
  let usdc;

  const [stakingPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from(STAKING_SEED)],
      program.programId
    );
  const METADATA_SEED = "metadata";

  const [metadataAddress] = anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from(METADATA_SEED),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );
  const account1 = program.provider.publicKey
  const account2 = anchor.web3.Keypair.generate()
  const account2Investment= new BN(0.5e9) // sol
  const account2UsdcInvestment= new BN(100e6) // usdc
  const date = Math.floor(new Date().getTime()/1000)

  const [presalePda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from(PRESALE_SEED)],
    program.programId
  );
let presale_usdc_ata;
let totalTokenStaked = 0;
  const mintAmount = 100_000_000_000;
  const payer_ata =  anchor.utils.token.associatedAddress({
    mint: mint,
    owner: account1,
  });
  const presale_ata = anchor.utils.token.associatedAddress({
    mint: mint,
    owner: presalePda,
  });
  const staking_ata = anchor.utils.token.associatedAddress({
    mint: mint,
    owner: stakingPda,
  });
  before(async()=>{
    await airdropSol(account2.publicKey, 20*1e9); // 3 SOL
    
  })
it("init token",async()=>{
  const context = {
    metadata: metadataAddress,
    mint,
    payer:account1,
    rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    systemProgram: anchor.web3.SystemProgram.programId,
    tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
    tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
  };

  await token.methods
    .initToken(metadata)
    .accounts(context)
    .rpc();
})



  it("initializer", async () => {
    const payer = account2

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
   console.log(usdc.toString())
    
   
    presale_usdc_ata = await getOrCreateAssociatedTokenAccount(
      program.provider.connection,
      payer,
      usdc,
      presalePda,
      true
  );
    const presale_ata = anchor.utils.token.associatedAddress({
      mint: mint,
      owner: presalePda,
    });
  
    const startPresaleContext = {
      signer:account1,
      presale:presalePda,
      staking:stakingPda,
      tokenMint:mint,
      usdcMint:usdc,
      presaleUsdcAccount:presale_usdc_ata.address,
      stakingTokenAccount:staking_ata,
      presaleTokenAccount:presale_ata,
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

  it("mint token",async()=>{
 
    const mintContext = {
      mint,
      destination:payer_ata,
      payer:account1,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      systemProgram: anchor.web3.SystemProgram.programId,
      tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
    };
    await token.methods
      .mintTokens(new anchor.BN((mintAmount * 10 ** metadata.decimals).toString()))
      .accounts(mintContext)
      .rpc();

      const balance = (await program.provider.connection.getTokenAccountBalance(payer_ata))
      assert.equal(Number(balance.value.amount),mintAmount* 10 ** metadata.decimals)
  })



  it("update token address in presale",async()=>{
 
    const context = {
      tokenMint:mint,
      presale:presalePda,
      signer:account1,
    };
    await program.methods
      .updateTokenAddress()
      .accounts(context)
      .rpc();
  })

  it("transfer tokens to presale", async () => {
    const transferAmount = 100_000_000_000
    const from_ata =  payer_ata;

    const reciever_ata = anchor.utils.token.associatedAddress({
      mint: mint,
      owner: presalePda,
    });


    const context = {
      from:account1,
      to:presalePda,
      fromAta:from_ata,
      toAta:reciever_ata,
      mint,
      systemProgram: anchor.web3.SystemProgram.programId,
      tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
    };

     await token.methods
      .transfer(new anchor.BN((transferAmount * 10 ** metadata.decimals).toString()))
      .accounts(context)
      .rpc();

      const balance = (await program.provider.connection.getTokenAccountBalance(reciever_ata))
      assert.equal(Number(balance.value.amount),transferAmount* 10 ** metadata.decimals)
  });

  it("invest using sol",async()=>{
    const [dataPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from(DATA_SEED),account2.publicKey.toBuffer()],
      program.programId
    );
   
    const reciever_ata = anchor.utils.token.associatedAddress({
      mint: mint,
      owner: account2.publicKey,
    });
  
    const userUsdcTokenAccount = await getOrCreateAssociatedTokenAccount(
      program.provider.connection,
      account2,
      usdc,  // The mint address
      account2.publicKey // Owner of the token account
  );
  
  
    const context = {
      data:dataPda,
      from:account2.publicKey,
      signer:account2.publicKey,
      presale:presalePda,
      investor_usdc_account:userUsdcTokenAccount.address,
      presaleUsdcAccount:presale_usdc_ata.address,
      usdcMint:usdc,
      presaleTokenAccount:presale_ata,
      tokenMint:mint,
      signerTokenAccount:reciever_ata,
      systemProgram: anchor.web3.SystemProgram.programId,
      tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
    }

    const presaleBalance = (await program.provider.connection.getTokenAccountBalance(presale_ata))
    // Add your test here.
    await program.methods.invest(new BN(0.5*1000000000),0)        
    .accounts(context)
    .signers([account2])
    .rpc();
    
    const afterPresaleBalance = (await program.provider.connection.getTokenAccountBalance(presale_ata))
    // let solBalance = await program.account.presaleInfo.fetch(presalePda)
    // assert.equal(Number(solBalance.amountRaised),2*1e9);
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
      mint: mint,
      owner: account2.publicKey,
    });
  
    const userUsdcTokenAccount = await getOrCreateAssociatedTokenAccount(
      program.provider.connection,
      account2,
      usdc,  // The mint address
      account2.publicKey // Owner of the token account
  );
  
  
    const context = {
      data:dataPda,
      from:account2.publicKey,
      signer:account2.publicKey,
      presale:presalePda,
      investor_usdc_account:userUsdcTokenAccount.address,
      presaleUsdcAccount:presale_usdc_ata.address,
      usdcMint:usdc,
      presaleTokenAccount:presale_ata,
      tokenMint:mint,
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
    
    const afterPresaleBalance = (await program.provider.connection.getTokenAccountBalance(presale_ata))
    // let solBalance = await program.account.presaleInfo.fetch(presalePda)
    // assert.equal(Number(solBalance.amountRaised),2*1e9);
    const data = await program.account.investmentData.fetch(dataPda)
    const presaleData = await program.account.presaleInfo.fetch(presalePda)
    const balance = (await program.provider.connection.getTokenAccountBalance(reciever_ata))
    assert.equal(Number(balance.value.amount),Number(data.numberOfTokens))
    assert.equal(Number(mintAmount* 10 ** metadata.decimals)-Number(presaleData.totalTokensSold),Number(afterPresaleBalance.value.amount))
    assert.equal(Number(account2UsdcInvestment),Number(data.usdcInvestmentAmount))
  })
 


it("buy with sol and stake",async()=>{
 
  const userUsdcTokenAccount = await getOrCreateAssociatedTokenAccount(
    program.provider.connection,
    account2,
    usdc,  // The mint address
    account2.publicKey // Owner of the token account
);

  const [dataPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from(DATA_SEED),account2.publicKey.toBuffer()],
        program.programId
      );
      
  const [stakingDataPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from(DATA_SEED_STAKING),account2.publicKey.toBuffer()],
        program.programId
      );
     
      const reciever_ata = anchor.utils.token.associatedAddress({
        mint: mint,
        owner: account2.publicKey,
      });


      const staking_ata = anchor.utils.token.associatedAddress({
        mint: mint,
        owner: stakingPda,
      });
  
    
      const context = {
        investmentData:dataPda,
        stakingData:stakingDataPda,
        presale:presalePda,
        staking:stakingPda,
        from:account2.publicKey,
        signer:account2.publicKey,
        tokenMint:mint,
        presaleTokenAccount:presale_ata,
        stakingTokenAccount:staking_ata,
        signerTokenAccount:reciever_ata,
        usdcMint:usdc,
        presaleUsdcAccount:presale_usdc_ata.address,
        signerUsdAccount:userUsdcTokenAccount.address,
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
      totalTokenStaked += Math.floor(Number(account2Investment)*100000/Number(presaleData.pricePerTokenInSol));

      assert.equal(Number(stakingData.totalTokensStaked),totalTokenStaked);

       assert.equal(userData.isFirstTime,true);
})



it("buy with usdc and stake",async()=>{
 
  const userUsdcTokenAccount = await getOrCreateAssociatedTokenAccount(
    program.provider.connection,
    account2,
    usdc,  // The mint address
    account2.publicKey // Owner of the token account
);

  const [dataPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from(DATA_SEED),account2.publicKey.toBuffer()],
        program.programId
      );
      
  const [stakingDataPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from(DATA_SEED_STAKING),account2.publicKey.toBuffer()],
        program.programId
      );
     
      const reciever_ata = anchor.utils.token.associatedAddress({
        mint: mint,
        owner: account2.publicKey,
      });


      const staking_ata = anchor.utils.token.associatedAddress({
        mint: mint,
        owner: stakingPda,
      });
  
    
      const context = {
        investmentData:dataPda,
        stakingData:stakingDataPda,
        presale:presalePda,
        staking:stakingPda,
        from:account2.publicKey,
        signer:account2.publicKey,
        tokenMint:mint,
        presaleTokenAccount:presale_ata,
        stakingTokenAccount:staking_ata,
        signerTokenAccount:reciever_ata,
        usdcMint:usdc,
        presaleUsdcAccount:presale_usdc_ata.address,
        signerUsdAccount:userUsdcTokenAccount.address,
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
})


  it("withdraw sol",async()=>{
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
  account2,
  usdc,  // The mint address
  account1 // Owner of the token account
);

    const startPresaleContext = {
      
      signer:account1,
      presale:presalePda,
      presaleUsdcAccount:presale_usdc_ata.address,
      signerUsdAccount:userUsdcTokenAccount.address,
      usdcMint:usdc,
      systemProgram: anchor.web3.SystemProgram.programId,
      tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
    }
    const beforeBalance = await getSolBalance(program,account1)
    await program.methods.adminWithdrawUsdcAndSol()        
    .accounts(startPresaleContext)
    .rpc();
    const afterBalance = await getSolBalance(program,account1)
    const rentExemption = await program.provider.connection.getMinimumBalanceForRentExemption(program.account.presaleInfo.size)
    assert.isTrue(afterBalance > beforeBalance+Number(account2Investment) - rentExemption);
  })

  it("withdraw tokens",async()=>{
    

    const reciever_ata = anchor.utils.token.associatedAddress({
      mint: mint,
      owner: account1,
    });
    const presale_ata = anchor.utils.token.associatedAddress({
      mint: mint,
      owner: presalePda,
    });

    const context = {
      presaleTokenAccount:presale_ata,
      signerTokenAccount:reciever_ata,
      presale:presalePda,
      signer:account1,
      tokenMint:mint,
      tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
      associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
    }

    // Add your test here.
    await program.methods.adminWithdrawTokens()        
    .accounts(context)
    .rpc();
    const balance = (await program.provider.connection.getTokenAccountBalance(reciever_ata))
    const presaleBalance = (await program.provider.connection.getTokenAccountBalance(presale_ata))
    const data = await program.account.presaleInfo.fetch(presalePda)
    const stakingInfo = await program.account.stakingInfo.fetch(stakingPda);
    assert.equal(Number(balance.value.amount),Number(mintAmount* 10 ** metadata.decimals - Number(data.totalTokensSold) + Number(stakingInfo.totalTokensStaked)))
    assert.equal(Number(presaleBalance.value.amount),Number(0))
  })

  it("transfer tokens to presale", async () => {


    const context = {
      presale:presalePda,
      signer:account1
    };

     await program.methods
      .togglePresale(false)
      .accounts(context)
      .rpc();
      const data = await program.account.presaleInfo.fetch(presalePda)
      assert.equal(data.isLive,false)

  });
 
});
