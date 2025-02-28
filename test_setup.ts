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
      "4FYXwXZX42z5uxJcSZeggCn4mkJpqn25L34aZY9N9wg2"
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
  });
});
