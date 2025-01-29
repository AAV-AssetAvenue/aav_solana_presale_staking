use anchor_lang::prelude::*;

use anchor_spl::{
    metadata::{
        create_metadata_accounts_v3,update_metadata_accounts_v2, mpl_token_metadata::types::DataV2,UpdateMetadataAccountsV2, CreateMetadataAccountsV3,
    },
    token::{MintTo, Burn,Transfer, Approve, SetAuthority},
};
use anchor_spl::{
    associated_token::AssociatedToken,
    metadata::Metadata,
    token::{Mint, Token, TokenAccount},
};

declare_id!("7bjWGkAyy4pRGZtSqhJDJVdYtf3oNnWXKUfmo89o8VGr");
pub const MAX_CAP: u64 = 100_000_000_000_000_000; // 6 decimals
pub const MIN_SEED:&[u8] = "token-mint".as_bytes(); // mint seeds for PDA


#[program]
pub mod solana_spl {

    use super::*;
 
    pub fn init_token(ctx: Context<InitToken>, metadata: InitTokenParams) -> Result<()> {
        // PDA seeds and bump to "sign" for CPI
        let seeds = &[MIN_SEED, &[ctx.bumps.mint]];
        let signer = [&seeds[..]];


        // On-chain token metadata for the mint
        let token_data = DataV2 {
            name: metadata.name,
            symbol: metadata.symbol,
            uri: metadata.uri,
            seller_fee_basis_points: 0,
            creators: None,
            collection: None,
            uses: None,
        };

        let metadata_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_metadata_program.to_account_info(),
            CreateMetadataAccountsV3 {
                payer: ctx.accounts.payer.to_account_info(),
                update_authority: ctx.accounts.payer.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                metadata: ctx.accounts.metadata.to_account_info(),
                // mint_authority: ctx.accounts.mint.to_account_info(),
                mint_authority: ctx.accounts.payer.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
            },
            &signer,
        );

        create_metadata_accounts_v3(
            metadata_ctx, // cpi context
            token_data,// token metadata
            true,  // is_mutable
            true, // update_authority_is_signer
            None // collection details
        )?;

        Ok(())
    }

    pub fn update_metadata(ctx: Context<UpdateMetadata>, new_metadata: InitTokenParams) -> Result<()> {

        let new_data = DataV2 {
            name: new_metadata.name,
            symbol: new_metadata.symbol,
            uri: new_metadata.uri,
            seller_fee_basis_points: 0, // Modify if needed
            creators: None,
            collection: None,
            uses: None,
        };

        let metadata_ctx = CpiContext::new(
            ctx.accounts.token_metadata_program.to_account_info(),
            UpdateMetadataAccountsV2 {
                update_authority: ctx.accounts.payer.to_account_info(),
                metadata: ctx.accounts.metadata.to_account_info(),
            }
        );

        update_metadata_accounts_v2(
            metadata_ctx,  // CPI context
            None,          // New update authority, if any
            Some(new_data), // Updated data
            None,          // Primary sale happened
            None           // Is mutable
        )?;

        Ok(())

    }

    pub fn mint_tokens(ctx: Context<MintTokens>, amount: u64) -> Result<()> {

        // require!(ctx.accounts.mint.supply + amount <= MAX_CAP, CustomError::CapExceed);

        // PDA seeds and bump to "sign" for CPI
        let seeds = &[MIN_SEED, &[ctx.bumps.mint]];
        let signer = [&seeds[..]];

        anchor_spl::token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    // authority: ctx.accounts.mint.to_account_info(),
                    authority: ctx.accounts.payer.to_account_info(),
                    to: ctx.accounts.destination.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                },
                &signer,
            ),
            amount,
        )?;

        Ok(())
    }

    pub fn transfer(ctx: Context<TransferToken>, amount: u64) -> Result<()> {

        anchor_spl::token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    authority: ctx.accounts.from.to_account_info(),
                    from: ctx.accounts.from_ata.to_account_info(),
                    to: ctx.accounts.to_ata.to_account_info(),
                },
            ),
            amount,
        )?;
        Ok(())
    }

    pub fn approve(ctx: Context<ApproveToken>, amount: u64) -> Result<()> {
        anchor_spl::token::approve(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Approve {
                    to: ctx.accounts.from_ata.to_account_info(),
                    authority: ctx.accounts.from.to_account_info(),
                    delegate: ctx.accounts.delegate.to_account_info(),   
                },
            ),
            amount,
        )?;
        Ok(())
    }

 
}







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
#[error_code]
pub enum CustomError {
    #[msg("Can not mint more tokens")]
    CapExceed,
}
