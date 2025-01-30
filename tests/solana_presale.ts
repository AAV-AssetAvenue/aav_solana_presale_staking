import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolanaPresale } from "../target/types/solana_presale";
import { assert } from "chai";
import { BN } from "bn.js";
import { SolanaSpl } from "../target/types/solana_spl";
import { createAssociatedTokenAccount } from "@solana/spl-token";

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

describe("solana presale testcases", () => {
  

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
    decimals: 6,
  };
  const MINT_SEED = "token-mint";
  const DATA_SEED = "my_data";
  const PRESALE_SEED = "solana_presale";
  const [mint] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from(MINT_SEED)],
    token.programId
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
  const account2Investment= new BN(2*1e9)
  const date = Math.floor(new Date().getTime()/1000)
  const endDate = date +  7 // 7 seconds
  const goal = 3*1e9

  const [presalePda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from(PRESALE_SEED)],
    program.programId
  );

  const mintAmount = 100_000_000_000;
  const payer_ata =  anchor.utils.token.associatedAddress({
    mint: mint,
    owner: account1,
  });
 
  before(async()=>{
    await airdropSol(account2.publicKey, 3*1e9); // 3 SOL
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



  it("start presale", async () => {
   
    const startPresaleContext = {
      signer:account1,
      presale:presalePda,
      tokenMint:mint,
      systemProgram: anchor.web3.SystemProgram.programId,
      
    }

    // Add your test here.
    await program.methods.initializer(
      new BN(goal), // goal
      new BN(date), // startTime
      new BN(endDate), // endTime
      new BN(150900) // pricePerToken
    )        
    .accounts(startPresaleContext)
    .rpc();



    const data = await program.account.presaleInfo.fetch(presalePda)
    assert.equal(endDate,Number(data.endTime));
    assert.equal(goal,Number(data.goal));
    assert.equal(date,Number(data.startTime));
    assert.equal(150900,Number(data.pricePerToken));
    assert.equal(true,data.isLive);
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
    const transferAmount = 10
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
  });

  it("invest sol",async()=>{
    const [dataPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from(DATA_SEED),account2.publicKey.toBuffer()],
      program.programId
    );
   
    const reciever_ata = anchor.utils.token.associatedAddress({
      mint: mint,
      owner: account2.publicKey,
    });
    const presale_ata = anchor.utils.token.associatedAddress({
      mint: mint,
      owner: presalePda,
    });

  
    const context = {
      data:dataPda,
      from:account2.publicKey,
      presale:presalePda,
      signer:account2.publicKey,
      presaleTokenAccount:presale_ata,
      tokenMint:mint,
      signerTokenAccount:reciever_ata,
      systemProgram: anchor.web3.SystemProgram.programId,
      tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
    }

    // Add your test here.
    await program.methods.investSol(account2Investment)        
    .accounts(context)
    .signers([account2])
    .rpc();

    // let solBalance = await program.account.presaleInfo.fetch(presalePda)
    // assert.equal(Number(solBalance.amountRaised),2*1e9);
    const data = await program.account.investmentData.fetch(dataPda)
    const balance = (await program.provider.connection.getTokenAccountBalance(reciever_ata))
    assert.equal(Number(balance.value.amount),Number(data.numberOfTokens))
    assert.equal(Number(account2Investment),Number(data.amount))
  })
 



  it("fail withdraw sol",async()=>{
    try{
   
    const startPresaleContext = {

      signer:account2.publicKey,
      presale:presalePda,
      systemProgram: anchor.web3.SystemProgram.programId,

    }
    // Add your test here.
    await program.methods.withdrawSol()        
    .accounts(startPresaleContext)
    .signers([account2])
    .rpc();
  }catch(e){
    if (e instanceof anchor.AnchorError){
    assert(e.message.includes("Unauthorized"))
  }else{
    assert(false);
  }
}
  })

  it("withdraw sol",async()=>{
   
    const startPresaleContext = {

      signer:account1,
      presale:presalePda,
      systemProgram: anchor.web3.SystemProgram.programId,

    }
    const beforeBalance = await getSolBalance(program,account1)
    await program.methods.withdrawSol()        
    .accounts(startPresaleContext)
    .rpc();
    const afterBalance = await getSolBalance(program,account1)
    const rentExemption = await program.provider.connection.getMinimumBalanceForRentExemption(program.account.presaleInfo.size)
    assert.isTrue(afterBalance > beforeBalance+Number(2*1e9) - rentExemption);
  })

  it("withdraw tokens",async()=>{
    // await sleep(7)

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
    await program.methods.emergencyWithdrawTokens()        
    .accounts(context)
    .rpc();
    const balance = (await program.provider.connection.getTokenAccountBalance(reciever_ata))
    const data = await program.account.presaleInfo.fetch(presalePda)

    assert.equal(Number(balance.value.amount),Number(mintAmount* 10 ** metadata.decimals- Number(data.totalTokensSold)))
    // assert.equal(Number(account2Investment),Number(data.amount))
  })

});
