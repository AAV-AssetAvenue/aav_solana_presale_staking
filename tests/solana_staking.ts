import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolanaStaking } from "../target/types/solana_staking";
import { assert } from "chai";
import { BN } from "bn.js";
import { SolanaSpl } from "../target/types/solana_spl";
import { createAccount, createAssociatedTokenAccount, createMint, getAccount, getAssociatedTokenAddress, mintTo,transfer } from "@solana/spl-token";

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

async function advanceBlocktime(seconds: number) {
  const provider = anchor.AnchorProvider.local();
  const connection = provider.connection;

  // Get the current block timestamp
  let slot = await connection.getSlot();
  let blockTime = await connection.getBlockTime(slot);

  if (!blockTime) {
      throw new Error("Could not fetch block time.");
  }

  let newTime = blockTime + seconds;

  // Increase the slot number to simulate time passing
  const slotsToAdvance = Math.ceil(seconds / 0.4); // 1 slot = ~400ms (depends on network)
  for (let i = 0; i < slotsToAdvance; i++) {
      await airdropSol(provider.wallet.publicKey, 1_000_000_000);
  }

  console.log(`⏳ Time increased by ${seconds} seconds (Slots: ${slotsToAdvance})`);
}



async function getSolBalance(pg:Program<SolanaStaking>,address:anchor.web3.PublicKey):Promise<number>{
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
    const transferAmount = 10
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
      .transfer(new anchor.BN((transferAmount * 10 ** metadata.decimals).toString()))
      .accounts(context)
      .rpc();



    const balance = (await program.provider.connection.getTokenAccountBalance(reciever_ata))

    assert.equal(Number(balance.value.amount),Number(transferAmount* 10 ** metadata.decimals));
  

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
       await program.methods.stakeTokens(stakingAmount)        
       .accounts(context)
       .rpc(); 
})


it("un stake",async()=>{
  const context1 = {
    signer:account1,
    staking:stakingPda,
  }
  // Add your test here.
  await program.methods.allowClaiming()        
  .accounts(context1)
  .rpc();

  await   advanceBlocktime(86400);

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
   
       // Add your test here.
       await program.methods.unstakeTokens()        
       .accounts(context)
       .rpc(); 
    
        //    const afterBalance = (await program.provider.connection.getTokenAccountBalance(reciever_ata))
        //    assert.equal(Number(afterBalance.value.amount),Number(beforeBalance.value.amount)+stakingAmount.toNumber()+reward);

})
})