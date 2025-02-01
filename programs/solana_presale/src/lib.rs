use anchor_lang::{prelude::*, solana_program};
use anchor_spl::{associated_token::AssociatedToken, token::{transfer, Mint, Token, TokenAccount, Transfer}};
declare_id!("G7n94bhEkqKwBkgqVALJ2AzPrugaca5XH2pWw3xy88xB");

#[program]
pub mod solana_presale {


    use super::*;

    pub fn initializer(
        ctx: Context<StartPresale>,
        start_time: u64,
        price_per_token: u64,
    ) -> Result<()> {
        let presale = &mut ctx.accounts.presale;
        require!(!presale.is_initialized, CustomError::AlreadyInitialized);

        presale.start_time = start_time;
        presale.price_per_token_in_sol = price_per_token; // 0.000368664 sol  = 368664
        presale.is_live = true;
        presale.is_initialized = true;
        presale.sol_amount_raised = 0;
        presale.token_mint =  ctx.accounts.token_mint.key();
        presale.authority = ctx.accounts.signer.key();
        Ok(())
    }
  
 
    // function for users to invest in presale using sol and get tokens in return.
    // there is no vesting
    // min investment is 0.5 sol and max investment is 200 sol
    pub fn invest_sol(ctx: Context<Invest>, value: u64) -> Result<()> {
        require!(value >= 500000000 && value <= 200000000000, CustomError::WrongAmount);

        let presale_data = &mut ctx.accounts.presale;
        let user_data = &mut ctx.accounts.data;
        
        require!(presale_data.is_live, CustomError::PresaleNotLive);


        let cur_timestamp = u64::try_from(Clock::get()?.unix_timestamp).unwrap();

        
        require!(cur_timestamp >= presale_data.start_time, CustomError::PresaleNotStarted);

        
        user_data.sol_investment_amount += value;
       
       //token has 5 decimals
        let number_of_tokens = value * 100000 / presale_data.price_per_token_in_sol;
        
        user_data.number_of_tokens += number_of_tokens;
        
        presale_data.sol_amount_raised += value;
        presale_data.total_tokens_sold += number_of_tokens;

        let from_account = &ctx.accounts.from;
        let presale = presale_data.to_account_info();


        // Create the transfer instruction
        let transfer_instruction =
        solana_program::system_instruction::transfer(from_account.key, presale.key, value);

        // Invoke the transfer instruction for sol
        anchor_lang::solana_program::program::invoke(
            &transfer_instruction,
            &[
                from_account.to_account_info(),
                presale.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;
        // Invoke the transfer instruction for token
        transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.presale_token_account.to_account_info(),
                    to: ctx.accounts.signer_token_account.to_account_info(),
                    authority: ctx.accounts.presale.to_account_info(),
                },
                &[&[PRESALE_SEED, &[ctx.bumps.presale]][..]],
            ),
            number_of_tokens,
        )?;

        Ok(())
    }


    ////////////////////////////////////////////////////////////
    //                        Admin functions
    ////////////////////////////////////////////////////////////
    pub fn change_price(ctx: Context<StopPresale>,price:u64) -> Result<()> {
        
        let presale = &mut ctx.accounts.presale;

        presale.price_per_token_in_sol = price;
        Ok(())
    } 

    pub fn stop_presale(ctx: Context<StopPresale>,toggle:bool) -> Result<()> {
        
        let presale = &mut ctx.accounts.presale;

        presale.is_live = toggle;
        Ok(())
    }
    // update presale token mint address 
    pub fn update_token_address(ctx: Context<UpdateTokenAddress>) -> Result<()>{
        let presale = &mut ctx.accounts.presale;
        presale.token_mint =  ctx.accounts.token_mint.key();

        Ok(())
    }
    // emergency function for admin to withdraw tokens from presale. should be used in emergency scenario.
    pub fn emergency_withdraw_tokens(ctx: Context<WithdrawTokens>) -> Result<()> {
        
        transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.presale_token_account.to_account_info(),
                    to: ctx.accounts.signer_token_account.to_account_info(),
                    authority: ctx.accounts.presale.to_account_info(),
                },
                &[&[PRESALE_SEED, &[ctx.bumps.presale]][..]],
            ),
            ctx.accounts.presale_token_account.amount, //  balance of the presale token account.
        )?;
        
        Ok(())
    }
    // function for admin to withdraw sol from contract.
    pub fn withdraw_sol(ctx: Context<WithdrawSol>) -> Result<()> {

        let presale = &mut ctx.accounts.presale.to_account_info();
        let recipient = &ctx.accounts.signer;

        // Get the minimum rent-exempt balance for the account
        let rent_exemption = Rent::get()?.minimum_balance(presale.data_len());        
        
        let presale_balance = presale.lamports();

        require!(presale_balance > 0 , CustomError::InsufficientFunds);

        // Ensure there is enough balance to withdraw after leaving rent
        require!(
            presale_balance > rent_exemption,
            CustomError::InsufficientFunds
        );

        // Calculate the amount to withdraw, leaving the rent-exempt balance
        let amount_to_withdraw = presale_balance - rent_exemption;
        

        **presale.to_account_info().try_borrow_mut_lamports()? -= amount_to_withdraw;
        **recipient.to_account_info().try_borrow_mut_lamports()? += amount_to_withdraw;
    
        Ok(())
    }

}


// Constants
pub const PRESALE_SEED:&[u8] = "solana_presale".as_bytes();
pub const DATA_SEED:&[u8] = "my_data".as_bytes();

// Account States
#[account]
#[derive(Default)]
pub struct PresaleInfo {
    pub token_mint: Pubkey,
    pub sol_amount_raised: u64, // total sol raised
    pub total_tokens_sold: u64, // total token sold
    pub start_time: u64,
    pub price_per_token_in_sol: u64, // price per token in sol
    pub is_live:bool, // is presale is live
    pub is_initialized:bool, // is presale is initialized
    pub authority:Pubkey
}


#[account]
#[derive(Default)]
pub struct InvestmentData {
    pub sol_investment_amount: u64,
    pub number_of_tokens: u64,
}

// Contexts
#[derive(Accounts)]
pub struct StartPresale<'info> {
    #[account(
        init_if_needed,
        payer = signer,
          /*
        Discriminator: 8 bytes
        PresaleInfo : size of PresaleInfo
         */
        space=8 + std::mem::size_of::<PresaleInfo>(),
        seeds = [PRESALE_SEED],
        bump
    )]
    pub presale: Box<Account<'info, PresaleInfo>>,
    #[account(
        constraint = token_mint.is_initialized == true,
    )]
    pub token_mint: Box<Account<'info, Mint>>, // Token mint account


    #[account(mut)]
    pub signer: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,

}



#[derive(Accounts)]
pub struct Invest<'info> {
    #[account(
        init_if_needed,
        /*
        Discriminator: 8 bytes
        InvestmentData : size of InvestmentData
         */
        space=8 + std::mem::size_of::<InvestmentData>(),
        payer=from,
        seeds=[DATA_SEED,from.key().as_ref()],
        bump

    )]
    pub data: Box<Account<'info, InvestmentData>>,

    #[account(mut)]
    pub from: Signer<'info>,
    #[account(
        mut,
        seeds = [PRESALE_SEED],
        bump
    )]
    pub presale: Box<Account<'info,PresaleInfo>>,
    



    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = presale.key()
    )]
    pub presale_token_account: Box<Account<'info, TokenAccount>>,
    
    #[account(
        init_if_needed,
        payer = signer,
        associated_token::mint = token_mint,
        associated_token::authority = signer,
    )]
    pub signer_token_account: Box<Account<'info, TokenAccount>>,

 

    #[account(mut)]
    pub signer: Signer<'info>,


    #[account(mut)]
    pub token_mint: Box<Account<'info, Mint>>, 
   

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
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
        seeds = [PRESALE_SEED],
        bump
    )]
    pub presale: Box<Account<'info,PresaleInfo>>,
    pub system_program: Program<'info, System>,
}




#[derive(Accounts)]
pub struct WithdrawTokens<'info> {


    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = presale.key()
    )]
    pub presale_token_account: Box<Account<'info, TokenAccount>>,
    
    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = signer,
    )]
    pub signer_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [PRESALE_SEED],
        bump,
    )]
    pub presale: Box<Account<'info, PresaleInfo>>,

    #[account(
        mut,
        constraint = signer.key() == presale.authority.key() @ CustomError::Unauthorized,
    )]
    pub signer: Signer<'info>,


    #[account(mut)]
    pub token_mint: Box<Account<'info, Mint>>, 
   

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}


#[derive(Accounts)]
pub struct UpdateTokenAddress<'info> {
    #[account(
        constraint = token_mint.is_initialized == true,
    )]
    pub token_mint: Box<Account<'info, Mint>>, // Token mint account

    #[account(
        mut,
        seeds = [PRESALE_SEED],
        bump
    )]
    pub presale: Box<Account<'info, PresaleInfo>>,

    #[account(
        mut,
        constraint = signer.key() == presale.authority.key() @ CustomError::Unauthorized,
    )]
    pub signer: Signer<'info>,
    
}

#[derive(Accounts)]
pub struct StopPresale<'info> {
    #[account(
        mut,
        seeds = [PRESALE_SEED],
        bump
    )]
    pub presale: Box<Account<'info, PresaleInfo>>,

    #[account(
        mut,
        constraint = signer.key() == presale.authority.key() @ CustomError::Unauthorized,
    )]
    pub signer: Signer<'info>,
    
}

// Custom Errors
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
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Presale already stopped")]
    PresaleAlreadyStopped,
    #[msg("Presale has not ended yet")]
    PresaleHasNotEndedYet,
    #[msg("You Have Not Invested In Presale")]
    YouHaveNotInvestedInPresale,
    #[msg("Already claimed")]
    AlreadyClaimed,
    #[msg("Can not Ivest More Or Goal Reached")]
    CanNotIvestMoreOrGoalReached,
    #[msg("AlreadyInitialized")]
    AlreadyInitialized,
    #[msg("WrongTime")]
    WrongTime,
    #[msg("WrongAmount")]
    WrongAmount,
}

