// No imports needed: web3, anchor, pg and more are globally available
import {
    getAssociatedTokenAddress,
    createAssociatedTokenAccountInstruction,
    getAccount,
  } from "@solana/spl-token";
  
  describe("Test", () => {
    it("initialize", async () => {
      const PRESALE_SEED = "solana_presale";
      const STAKING_SEED = "solana_staking";
      const PROGRAM_ID = new anchor.web3.PublicKey(
        "3nnfTx68bKCRXZdZfKoFFfryWbnR3asFGmfLsXNPtXxK"
      ); // Your staking program ID
      const TOKEN_MINT = new anchor.web3.PublicKey(
        "HtcmNSmpM6xGWLH7TcUiyjXQcej32qc15wyzawJYKNMn"
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
      console.log(presale_ata.toString(), staking_ata.toString());
      const USDC_MINT = new anchor.web3.PublicKey(
        "4Fa3EWgea8bYwFjRdAxn9b7FhzFSYZR41Tnkn39SvSLX"
      );
  
      const usdc_presale_ata = anchor.utils.token.associatedAddress({
        mint: USDC_MINT,
        owner: presalePda,
      });
   
      console.log(presalePda.toString(),usdc_presale_ata.toString());
    });
  });
  