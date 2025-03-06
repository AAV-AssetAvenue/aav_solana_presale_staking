import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import {
    Connection,
    Keypair,
    sendAndConfirmTransaction,
    Transaction,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import idl from "../target/idl/solana_presale.json";
import bs58 from "bs58";
import { BN } from "bn.js";
import { SolanaPresale } from "../target/types/solana_presale";
import fs from "fs"

// Replace with your mainnet RPC URL
const RPC_URL = "https://api.devnet.solana.com";

// Retrieve your plain private key from an environment variable.
// The PRIVATE_KEY should be a string (for example, a base58-encoded key)
const privateKeyArray = JSON.parse(fs.readFileSync("/Users/asad97/.config/solana/id.json", 'utf8'));
// Convert to Uint8Array
const privateKeyUint8Array = new Uint8Array(privateKeyArray);

// Generate Keypair
const keypair = Keypair.fromSecretKey(privateKeyUint8Array);

console.log("Public Key:", keypair.publicKey.toBase58());

async function main() {
    // Create a connection to the mainnet
    const connection = new Connection(RPC_URL, "confirmed");

    // Create a wallet instance from your keypair
    const wallet = new Wallet(keypair);

    // Create the Anchor provider using the connection and wallet
    const provider = new AnchorProvider(connection, wallet, {
        preflightCommitment: "confirmed",
    });

    console.log("Wallet public key:", wallet.publicKey.toString());
    console.log("Wallet balance:", await connection.getBalance(wallet.publicKey));
    //   console.log("Provider connection:", provider.connection);
    //   console.log("Provider wallet:", provider.wallet);
    //   console.log("idl", idl);

    // Initialize the program using your IDL and provider
    const program = new anchor.Program<SolanaPresale>(idl as SolanaPresale, provider);

    console.log(
        "Program initialized on mainnet. Program ID:",
        program.programId.toString()
        // program
    );

    // Example: Fetch fee account data (adjust according to your program's account structure)
    try {
        const PRESALE_SEED = "solana_presale";
        const STAKING_SEED = "solana_staking";
        const PROGRAM_ID = new anchor.web3.PublicKey(
          "cKJnfPq2SPoosyz6YnnQKpsiMdqcYB9RHWm2F95H6n4"
        ); // Your staking program ID
        const TOKEN_MINT = new anchor.web3.PublicKey(
          "HtcmNSmpM6xGWLH7TcUiyjXQcej32qc15wyzawJYKNMn"
        );
        const USDC_MINT = new anchor.web3.PublicKey(
          "4Fa3EWgea8bYwFjRdAxn9b7FhzFSYZR41Tnkn39SvSLX"
        );
        const [presalePda] = anchor.web3.PublicKey.findProgramAddressSync(
          [Buffer.from(PRESALE_SEED)],
          PROGRAM_ID
        );
    
        const [stakingPda] = anchor.web3.PublicKey.findProgramAddressSync(
          [Buffer.from(STAKING_SEED)],
          PROGRAM_ID
        );
    
        const presale_ata = anchor.utils.token.associatedAddress({
          mint: TOKEN_MINT,
          owner: presalePda,
        });
        const staking_ata = anchor.utils.token.associatedAddress({
          mint: TOKEN_MINT,
          owner: stakingPda,
        });
    
        const usdc_presale_ata = anchor.utils.token.associatedAddress({
          mint: USDC_MINT,
          owner: presalePda,
        });
    
        const usdc_signer_ata = anchor.utils.token.associatedAddress({
          mint: USDC_MINT,
          owner: new anchor.web3.PublicKey(
            "CrepGjpjjaHiXEPhEw2rLywEtjgR9sRvL3LfUrPQq9im"
          ),
        });
        console.log("presalePda", presalePda.toString());
        console.log("stakingPda", stakingPda.toString());
        console.log("presale_ata", presale_ata.toString());
        console.log("staking_ata", staking_ata.toString());
    
        console.log("usdc_presale_ata", usdc_presale_ata.toString());
        console.log("usdc_signer_ata", usdc_signer_ata.toString());
        
const startPresaleContext = {
      signer:wallet.publicKey,
      presale:presalePda,
      staking:stakingPda,
      tokenMint:TOKEN_MINT,
      usdcMint:USDC_MINT,
      presaleUsdcAccount:usdc_presale_ata,
      stakingTokenAccount:staking_ata,
      presaleTokenAccount:presale_ata,
      systemProgram: anchor.web3.SystemProgram.programId,
      tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
      
    }

    // Add your test here.
    const configIx =  await program.methods.initializer(
      new BN(1741088159),
      new BN(368664),
      new BN(79067) 
    )        
    .accounts(startPresaleContext)
    .instruction();

            // @ts-ignore
            // const configIx = await program.methods
            //     .setConfig(
            //         tradeFee,
            //         new anchor.BN(creationFee),
            //         feeCollector,
            //         nativeFee,
            //         initialBuyLimit
            //     )
            //     .accounts({
            //         configAccount,
            //         user,
            //         systemProgram: SYSTEM_PROGRAM_ID,
            //     })
            //     .instruction();

            // console.log("Config IX:", configIx);

            const tx = new Transaction().add(configIx);

            tx.feePayer = wallet.publicKey;
            tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

            // console.log("Transaction:", tx);
            const signedTx = await wallet.signTransaction(tx);

            //  const simulateResult = await connection.simulateTransaction(signedTx);
            // console.log("Simulate result: ", simulateResult);
            const txId = await sendAndConfirmTransaction(connection, signedTx, [keypair]);
            console.log("txId ", txId);
    } catch (error) {
        console.error("Error fetching fee accounts:", error);
    }
}

main().catch((error) => {
    console.error("Error in main():", error);
});
