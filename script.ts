import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import {
    Connection,
    Keypair,
    Transaction,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import idl from "./target/idl/solana_presale.json";
import bs58 from "bs58";
import { BN } from "bn.js";
import { SolanaPresale } from "./target/types/solana_presale";


// Replace with your mainnet RPC URL
const RPC_URL = "https://api.devnet.solana.com";

// Retrieve your plain private key from an environment variable.
// The PRIVATE_KEY should be a string (for example, a base58-encoded key)
const privateKeyString =process.env.PRIVATE_KEY
if (!privateKeyString) {
    throw new Error("PRIVATE_KEY environment variable is not set.");
}

// Decode the base58 encoded private key string into a Uint8Array
const privateKey = bs58.decode(privateKeyString);
const keypair = Keypair.fromSecretKey(privateKey);

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
    const program = new anchor.Program<SolanaPresale>(idl, provider);

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
          "8BBRV7FzKbi923SVZm3udHB1VTDQwwNnbHyyB114WG5A"
        ); // Your staking program ID
        const TOKEN_MINT = new anchor.web3.PublicKey(
          "oFfHK5q6vvBy6r7rBQJhynxJYiUoYzoC5D9XcCkvts6"
        );
        const USDC_MINT = new anchor.web3.PublicKey(
          "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
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
            "HzmZ5f16agTyCrFFPDi2T7vgpAqfENSLUWLEefH3bpDX"
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

            const simulateResult = await connection.simulateTransaction(tx);
            console.log("Simulate result: ", simulateResult);
    } catch (error) {
        console.error("Error fetching fee accounts:", error);
    }
}

main().catch((error) => {
    console.error("Error in main():", error);
});
