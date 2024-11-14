use anchor_lang::prelude::*;

use anchor_spl::{
    metadata::{
        create_metadata_accounts_v3,update_metadata_accounts_v2, mpl_token_metadata::types::DataV2,UpdateMetadataAccountsV2, CreateMetadataAccountsV3,
    },
    token::{MintTo, Burn,Transfer, Approve, SetAuthority},
};
mod states;
mod errors;
mod constants;

use crate::states::*;
use crate::errors::*;

use constants::*;

declare_id!("GamePwTMVwuMij2eagMjQtwVKEPv9xm6w1SciZ4XH24V");


#[program]
pub mod omerta_solana_spl {

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

        require!(ctx.accounts.mint.supply + amount <= MAX_CAP, OmertaError::CapExceed);

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

    pub fn burn(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
        anchor_spl::token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.mint.to_account_info(),
                    from: ctx.accounts.from_ata.to_account_info(),   
                    authority: ctx.accounts.payer.to_account_info(),
                },
            ),
            amount,
        )?;
        Ok(())
    }

    pub fn change_mint_authority(ctx: Context<ChangeMintAuthority>,new_authority: Pubkey) -> Result<()> {
        anchor_spl::token::set_authority(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                SetAuthority {
                    current_authority: ctx.accounts.current_authority.to_account_info(),
                    account_or_mint:ctx.accounts.mint.to_account_info() 
                },
            ),
            anchor_spl::token::spl_token::instruction::AuthorityType::MintTokens, // AuthorityType is an enum
            Some(new_authority),
        )?;
        Ok(())
    }
}



