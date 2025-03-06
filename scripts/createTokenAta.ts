import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import {
    Connection,
    Keypair,
    PublicKey,
    Transaction,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import idl from "../target/idl/solana_presale.json";
import bs58 from "bs58";
import { BN } from "bn.js";
import { SolanaPresale } from "../target/types/solana_presale";
import { getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
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
       
        const USDC_MINT = new anchor.web3.PublicKey(
          "4Fa3EWgea8bYwFjRdAxn9b7FhzFSYZR41Tnkn39SvSLX"
        );
        //HtcmNSmpM6xGWLH7TcUiyjXQcej32qc15wyzawJYKNMn aav token
        //4Fa3EWgea8bYwFjRdAxn9b7FhzFSYZR41Tnkn39SvSLX usdc token
    
          const presale_usdc_ata = await getOrCreateAssociatedTokenAccount(
              program.provider.connection,
              wallet.payer,
              USDC_MINT,
              new PublicKey("9DSZEoCUruUUkuHZCbKaGo5wohTC8GuPYqgzBUNzdht6"),
              true
          );
console.log(presale_usdc_ata.address.toBase58());
const balance = (await program.provider.connection.getTokenAccountBalance(new PublicKey("CniDWpEYFdUkyGwg74qF8EbQtEyULdEAiso7K9eZ71Lx")))
console.log(balance.value.uiAmount);
console.log(balance.value.amount);
    } catch (error) {
        console.error("Error fetching fee accounts:", error);
    }
}

main().catch((error) => {
    console.error("Error in main():", error);
});
