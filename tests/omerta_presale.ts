import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { OmertaPresale } from "../target/types/omerta_presale";
import { assert } from "chai";
import { BN } from "bn.js";

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



async function getSolBalance(pg:Program<OmertaPresale>,address:anchor.web3.PublicKey):Promise<number>{
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

describe("omerta_presale", () => {
  

  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.OmertaPresale as Program<OmertaPresale>;
  
  const account1 = program.provider.publicKey
  const account2 = anchor.web3.Keypair.generate()

  const date = Math.floor(new Date().getTime()/1000)
  const endDate = date +  7 // 7 seconds
  const goal = 3*1e9

  const [presalePda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("omerta_presale")],
    program.programId
  );


  before(async()=>{
    await airdropSol(account2.publicKey, 3*1e9); // 3 SOL
  })

  it("start presale", async () => {
    
    const startPresaleContext = {
      signer:account1,
      presale:presalePda,
      systemProgram: anchor.web3.SystemProgram.programId,

    }

    // Add your test here.
    await program.methods.startPresale(
      new BN(goal), // goal
      new BN(date), // startTime
      new BN(endDate), // endTime
      new BN(1000) // pricePerToken
    )        
    .accounts(startPresaleContext)
    .rpc();



    const data = await program.account.presaleInfo.fetch(presalePda)
    assert.equal(endDate,Number(data.endTime));
    assert.equal(goal,Number(data.goal));
    assert.equal(date,Number(data.startTime));
    assert.equal(1000,Number(data.pricePerToken));
    assert.equal(true,data.isLive);
  });
  it("invest sol",async()=>{
    const [dataPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("my_data"),account2.publicKey.toBuffer()],
      program.programId
    );
    const context = {
      data:dataPda,
      from:account2.publicKey,
      presale:presalePda,
      systemProgram: anchor.web3.SystemProgram.programId,

    }

    await sleep(5)
    // Add your test here.
    await program.methods.investSol(new BN(2*1e9))        
    .accounts(context)
    .signers([account2])
    .rpc();

    let solBalance = await program.account.presaleInfo.fetch(presalePda)
    assert.equal(Number(solBalance.amountRaised),2*1e9);


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
    assert(e.message.includes("unauthorized"))
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
    // Add your test here.
    await program.methods.withdrawSol()        
    .accounts(startPresaleContext)
    .rpc();
    const afterBalance = await getSolBalance(program,account1)
    assert.isTrue(afterBalance > beforeBalance+Number(2*1e9));
  })
});
