import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import {
    Connection,
    Keypair,
    PublicKey,
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
const RPC_URL = "https://api.mainnet-beta.solana.com";

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
    const PRESALE_SEED = "solana_presale";
    const STAKING_SEED = "solana_staking";
const PROGRAM_ID = new anchor.web3.PublicKey(
          "PwPPdoNVMJiUbQyHLTRif18JdKJiAKopv9y4i78y8M3"
        );
        const TOKEN_MINT = new PublicKey(
            "AAVzPbhsinQk5jnTzsRrhftrjB6txyopdkqH8QmuGVo9"
          );
          const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    // Initialize the program using your IDL and provider
    const program = new anchor.Program<SolanaPresale>(idl as SolanaPresale, provider);
 const [presalePda] = anchor.web3.PublicKey.findProgramAddressSync(
          [Buffer.from(PRESALE_SEED)],
          PROGRAM_ID
        );
    console.log(
        "Program initialized on mainnet. Program ID:",
        program.programId.toString()
        // program
    );

     const presale_ata = anchor.utils.token.associatedAddress({
              mint: TOKEN_MINT,
              owner: presalePda,
            });
               const [stakingPda] = anchor.web3.PublicKey.findProgramAddressSync(
                      [Buffer.from(STAKING_SEED)],
                      PROGRAM_ID
                    );
                
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
    const data = await program.account.presaleInfo.fetch(presalePda)
    console.log(
        "Program initialized on mainnet. Program ID:",
        data.pricePerTokenInSol.toString(),
        data.pricePerTokenInUsdc.toString()
        // program
    );
}
main().catch((error) => {
    console.error("Error in main():", error);
});
