import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolanaStaking } from "../target/types/solana_staking";
import { assert } from "chai";
import { BN } from "bn.js";
import { SolanaSpl } from "../target/types/solana_spl";
// import { createAccount, createAssociatedTokenAccount, createMint, getAccount, getAssociatedTokenAddress, mintTo,transfer } from "@solana/spl-token";

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
  totalRewardPaid: anchor.BN;
  owner: anchor.web3.PublicKey;
}
type stakingInfo= {
  tokenMint: anchor.web3.PublicKey;
  totalTokensStaked: anchor.BN;
  totalTokensRewarded: anchor.BN;
  stakingStartDate: anchor.BN;
  isLive: boolean;
  allowClaiming: boolean;
  authority: anchor.web3.PublicKey;
}
const PRECISION = 1_000_000; // Match token decimals
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




describe("solana staking testcases", () => {
  

  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.SolanaStaking as Program<SolanaStaking>;
  const token = anchor.workspace.SolanaSpl as Program<SolanaSpl>;
  const TOKEN_METADATA_PROGRAM_ID = new anchor.web3.PublicKey(
    "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s" // metaplex metadata program id
  )
  const metadata = {
    name: "lamport Token",
    symbol: "LMT",
    uri: "https://pump.mypinata.cloud/ipfs/QmeSzchzEPqCU1jwTnsipwcBAeH7S4bmVvFGfF65iA1BY1?img-width=128&img-dpr=2&img-onerror=redirect",
    decimals: 6,
  };
  const MINT_SEED = "token-mint";
  const DATA_SEED = "staking_user_data";
  const STAKING_SEED = "solana_staking";
  const [mint] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from(MINT_SEED)],
    token.programId
  );

 
  const account1 = program.provider.publicKey
  const account2 = anchor.web3.Keypair.generate()
  const stakingAmount= new BN(2*1e6)

  const [stakingPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from(STAKING_SEED)],
    program.programId
  );

  const payer_ata =  anchor.utils.token.associatedAddress({
    mint: mint,
    owner: account1,
  });
 
  before(async()=>{
    await airdropSol(account2.publicKey, 3*1e9); // 3 SOL
  })

  it("start staking", async () => {
   
    const context = {
      signer:account1,
      staking:stakingPda,
      tokenMint:mint,
      systemProgram: anchor.web3.SystemProgram.programId,
      
    }

    // Add your test here.
    await program.methods.initializer(
    )        
    .accounts(context)
    .rpc();



    const data = await program.account.stakingInfo.fetch(stakingPda)
    // assert.equal(endDate,Number(data.endTime));
    // assert.equal(goal,Number(data.goal));
    // assert.equal(date,Number(data.startTime));
    // assert.equal(150900,Number(data.pricePerToken));
    assert.equal(true,data.isLive);
  });

 it("transfer tokens to staking", async () => {
    const transferAmount = new anchor.BN((100_000_000 * 10 ** metadata.decimals).toString())
    const from_ata =  payer_ata;

    const reciever_ata = anchor.utils.token.associatedAddress({
      mint: mint,
      owner: stakingPda,
    });


    const context = {
      from:account1,
      to:stakingPda,
      fromAta:from_ata,
      toAta:reciever_ata,
      mint,
      systemProgram: anchor.web3.SystemProgram.programId,
      tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
    };

     await token.methods
      .transfer(transferAmount)
      .accounts(context)
      .rpc();



    const balance = (await program.provider.connection.getTokenAccountBalance(reciever_ata))

    assert.equal(Number(balance.value.amount),Number(transferAmount));
  

})


it("stake",async()=>{

   const [dataPda] = anchor.web3.PublicKey.findProgramAddressSync(
         [Buffer.from(DATA_SEED),account1.toBuffer()],
         program.programId
       );
      
       const reciever_ata = anchor.utils.token.associatedAddress({
         mint: mint,
         owner: account1,
       });


  


       const staking_ata = anchor.utils.token.associatedAddress({
         mint: mint,
         owner: stakingPda,
       });
   
     
       const context = {
        from:account1,
         stakingData:dataPda,
         staking:stakingPda,
         stakingTokenAccount:staking_ata,
         signerTokenAccount:reciever_ata,
         signer:account1,
         tokenMint:mint,
         tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
         systemProgram: anchor.web3.SystemProgram.programId,
         associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
       }
   
       // Add your test here.
       await program.methods.stake(stakingAmount)        
       .accounts(context)
       .rpc(); 
})


it("unstake_and_claim_rewards",async()=>{

  // try{
  const context1 = {
    signer:account1,
    staking:stakingPda,
  }
  // Add your test here.
  await program.methods.allowClaiming(true)        
  .accounts(context1)
  .rpc();


   const [dataPda] = anchor.web3.PublicKey.findProgramAddressSync(
         [Buffer.from(DATA_SEED),account1.toBuffer()],
         program.programId
       );
      
       const reciever_ata = anchor.utils.token.associatedAddress({
         mint: mint,
         owner: account1,
       });


  


       const staking_ata = anchor.utils.token.associatedAddress({
         mint: mint,
         owner: stakingPda,
       });
   
     
       const context = {
           stakingData:dataPda,
        from:account1,
         staking:stakingPda,
         stakingTokenAccount:staking_ata,
         signerTokenAccount:reciever_ata,
         signer:account1,
         tokenMint:mint,
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



        //    assert.equal(Number(afterBalance.value.amount),Number(beforeBalance.value.amount)+stakingAmount.toNumber()+reward);
      // }catch(e) {
      // if (e instanceof anchor.AnchorError){
      //       assert(e.message.includes("NoRewards"))
      //     }else{
      //       assert(false);
      //     }
      // }
})
})