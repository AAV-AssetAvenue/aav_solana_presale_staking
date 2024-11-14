use anchor_lang::prelude::*;
use anchor_spl::{associated_token::AssociatedToken, token::{self, Mint, Token, TokenAccount, Transfer}};
declare_id!("G7n94bhEkqKwBkgqVALJ2AzPrugaca5XH2pWw3xy88xB");

#[program]
pub mod omerta_presale {

    use anchor_lang::solana_program::system_instruction;

    use super::*;

    pub fn start_presale(
        ctx: Context<StartPresale>,
        goal: u64,
        start_time: i64,
        end_time: i64,
        price_per_token: u64,
    ) -> Result<()> {
        let presale = &mut ctx.accounts.presale;

        // Set the presale details
        presale.goal = goal;
        presale.start_time = start_time;
        presale.end_time = end_time;
        presale.price_per_token = price_per_token;
        presale.is_live = true;
        presale.amount_raised = 0;
        presale.authority = ctx.accounts.signer.key();
        presale.token_mint =  ctx.accounts.token_mint.key();
        Ok(())
    }
    pub fn invest_sol(ctx: Context<Invest>, value: u64) -> Result<()> {
        let from_account = &ctx.accounts.from;
        let presale_data = &mut ctx.accounts.presale;


        let clock = Clock::get()?;
        let current_timestamp = clock.unix_timestamp;
        
        require!(presale_data.is_live, CustomError::PresaleNotLive);
        require!(current_timestamp > presale_data.start_time, CustomError::PresaleNotStarted);
        require!(current_timestamp < presale_data.end_time, CustomError::PresaleHasEnd);

        let presale = presale_data.to_account_info();
        
        ctx.accounts.data.amount += value;
        presale_data.amount_raised += value;

        let number_of_tokens = value/presale_data.price_per_token;
        ctx.accounts.data.number_of_tokens += number_of_tokens;


        // Create the transfer instruction
        let transfer_instruction =
            system_instruction::transfer(from_account.key, presale.key, value);

        // Invoke the transfer instruction
        anchor_lang::solana_program::program::invoke(
            &transfer_instruction,
            &[
                from_account.to_account_info(),
                presale.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        Ok(())
    }

    pub fn claim_tokens(ctx: Context<ClaimTokens>) -> Result<()> {
        let investment_data = &ctx.accounts.data;
        let presale_data = &ctx.accounts.presale;

        // Ensure the presale has ended before allowing token claims
        let clock = Clock::get()?;
        require!(clock.unix_timestamp > presale_data.end_time, CustomError::PresaleNotLive);

        let tokens_to_claim = investment_data.number_of_tokens;
        require!(tokens_to_claim > 0, CustomError::InsufficientFunds);

        token::transfer(
            ctx.accounts.into_transfer_to_user_context(),
            tokens_to_claim,
        )?;

        // Reset the number of tokens to prevent double-claims
        ctx.accounts.data.number_of_tokens = 0;

        Ok(())
    }
 

    pub fn withdraw_sol(ctx: Context<WithdrawSol>) -> Result<()> {

        let presale = &mut ctx.accounts.presale.to_account_info();
        let recipient = &ctx.accounts.signer;
        
        let presale_balance = presale.lamports();
        
        require!(presale_balance > 0 , CustomError::InsufficientFunds);

        **presale.to_account_info().try_borrow_mut_lamports()? -= presale_balance;
        **recipient.to_account_info().try_borrow_mut_lamports()? += presale_balance;
    
        Ok(())
    }

}


impl<'info> ClaimTokens<'info> {
    pub fn into_transfer_to_user_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.presale_token_account.to_account_info(),
                to: self.signer_token_account.to_account_info(),
                authority: self.presale.to_account_info(),
            },
        )
    }
}


#[derive(Accounts)]
pub struct ClaimTokens<'info> {
    #[account(
        mut,
        seeds = [b"my_data", signer.key().as_ref()],
        bump,
    )]
    pub data: Account<'info, InvestmentData>,

    #[account(
        mut,
        seeds = [b"omerta_presale"],
        bump,
    )]
    pub presale: Account<'info, PresaleInfo>,

    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        constraint = presale_token_account.mint == presale.token_mint,
        constraint = presale_token_account.owner == presale.key()
    )]
    pub presale_token_account: Account<'info, TokenAccount>,
    #[account(constraint = token_mint.is_initialized == true)]
    pub token_mint: Account<'info, Mint>, 
    #[account(
        init_if_needed,
        payer = signer,
        associated_token::mint = token_mint,
        associated_token::authority = signer,
    )]
    pub signer_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

#[account]
pub struct PresaleInfo {
    pub goal: u64,
    pub token_mint: Pubkey,
    pub amount_raised: u64,
    pub start_time: i64,
    pub end_time: i64,
    pub price_per_token: u64,
    pub is_live:bool,
    pub authority:Pubkey
}

#[derive(Accounts)]
pub struct StartPresale<'info> {
    #[account(
        init_if_needed,
        payer = signer,
        space=8 + std::mem::size_of::<PresaleInfo>(),
        seeds = [b"omerta_presale"],
        bump
    )]
    pub presale: Account<'info, PresaleInfo>,
    #[account(
        constraint = token_mint.is_initialized == true,
    )]
    pub token_mint: Account<'info, Mint>, // Token mint account
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}


#[derive(Accounts)]
pub struct Invest<'info> {
    #[account(
        init_if_needed,
        /*
        Discriminator: 8 bytes
        u64 : 8 bytes
         */
        space=8 + std::mem::size_of::<InvestmentData>(),
        payer=from,
        seeds=[b"my_data",from.key().as_ref()],
        bump

    )]
    pub data: Account<'info, InvestmentData>,

    #[account(mut)]
    pub from: Signer<'info>,
    #[account(
        mut,
        seeds = [b"omerta_presale"],
        bump
    )]
    pub presale: Account<'info,PresaleInfo>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct InvestmentData {
    pub amount: u64,
    pub number_of_tokens: u64,
}

#[derive(Accounts)]
pub struct WithdrawSol<'info> {
 
    #[account(
        mut,
        constraint = signer.key() == presale.authority.key() @ CustomError::Unauthorized,
    )]
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"omerta_presale"],
        bump
    )]
    pub presale: Account<'info,PresaleInfo>,
    pub system_program: Program<'info, System>,
}


#[error_code]
pub enum CustomError {
    #[msg("Insufficient funds")]
    InsufficientFunds,
    #[msg("Presale not live")]
    PresaleNotLive,
    #[msg("Presale not started")]
    PresaleNotStarted,
    #[msg("Presale has end")]
    PresaleHasEnd,
    #[msg("unauthorized")]
    Unauthorized,
}

