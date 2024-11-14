use anchor_lang::prelude::*;

use anchor_spl::{
    associated_token::AssociatedToken,
    metadata::Metadata,
    token::{Mint, Token, TokenAccount},
};

use crate::constants::MIN_SEED;




#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone)]
pub struct InitTokenParams {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
}

#[derive(Accounts)]
#[instruction(
    params: InitTokenParams
)]
pub struct InitToken<'info> {
    /// CHECK: New Metaplex Account being created
    #[account(mut)]
    pub metadata: UncheckedAccount<'info>,

    // create mint account PDA  
    #[account(
        init,
        seeds = [MIN_SEED],
        bump,
        payer = payer,
        mint::decimals = params.decimals,
        // mint::authority = mint,
        mint::authority = payer.key(),
    )]
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub token_metadata_program: Program<'info, Metadata>,
}

#[derive(Accounts)]
pub struct MintTokens<'info> {
    #[account(
        mut,
        seeds = [MIN_SEED],
        bump,
        mint::authority = payer.key(),
    )]
    pub mint: Account<'info, Mint>,


    // create destination ATA if it doesn't exist
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = payer,
    )]
    pub destination: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Accounts)]
pub struct TransferToken<'info> {
    #[account(mut)]
    pub from: Signer<'info>,
     /// CHECK:
    pub to:  UncheckedAccount<'info>, 

    #[account(mut)]
    pub mint: Account<'info, Mint>,

    #[account(mut)]
    pub from_ata: Account<'info, TokenAccount>,

    // create recipient ATA if it doesn't exist and the fee payer is "from" 
    #[account(
        init_if_needed,
        payer = from,
        associated_token::mint = mint,
        associated_token::authority = to,
    )]
    pub to_ata: Account<'info, TokenAccount>,
 
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}




#[derive(Accounts)]
pub struct ApproveToken<'info> {

    #[account(mut)]
    pub from_ata: Account<'info, TokenAccount>,

    pub from: Signer<'info>,
  
    /// CHECK: This is an unchecked account because the delegate doesn't need to be of any specific type.
    pub delegate: UncheckedAccount<'info>,  
 
    pub token_program: Program<'info, Token>,
}


#[derive(Accounts)]
pub struct BurnTokens<'info> {
    #[account(mut)]
    pub mint: Account<'info, Mint>,

    #[account(mut)]
    pub from_ata: Account<'info, TokenAccount>,

    pub payer: Signer<'info>,
    pub token_program: Program<'info, Token>,
}


#[derive(Accounts)]
pub struct ChangeMintAuthority<'info> {
    #[account(mut)]
    pub mint: Account<'info, Mint>,

    pub current_authority: Signer<'info>, // Current mint authority must sign the transaction
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}


#[derive(Accounts)]
#[instruction(
    params: InitTokenParams
)]
pub struct UpdateMetadata<'info> {
  /// CHECK: New Metaplex Account being created
  #[account(mut)]
  pub metadata: UncheckedAccount<'info>,
  #[account(mut)]
  pub mint: Account<'info, Mint>,
  
  #[account(mut)]
  pub payer: Signer<'info>,
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub token_metadata_program: Program<'info, Metadata>,
}