use anchor_lang::prelude::*;
use anchor_spl::{associated_token::AssociatedToken, token::{transfer, Mint, Token, TokenAccount, Transfer}};
declare_id!("GZuwgeF5xjZn97eo3RkhedPPdUDCHY3Q4LKUZSmGZLNj");




#[program]
pub mod solana_staking {

    use super::*;
    pub fn initializer(ctx: Context<StartStaking>) -> Result<()> {
        msg!("Instruction: Initialize");
        let staking = &mut ctx.accounts.staking;
        let cur_timestamp = u64::try_from(Clock::get()?.unix_timestamp).unwrap();

        staking.is_live = true;
        staking.total_tokens_staked = 0;
        staking.token_mint = ctx.accounts.token_mint.key();
        staking.authority = ctx.accounts.signer.key();
        staking.staking_start_date = cur_timestamp;
        staking.is_locked = true;
        Ok(())
    }
    pub fn allow_claiming(ctx: Context<UnlockStaking>,toggle:bool) -> Result<()> {
        let staking = &mut ctx.accounts.staking;
    
        staking.is_locked = toggle;
        msg!("Staking has been unlocked.");
    
        Ok(())
    }
    pub fn stop_staking(ctx: Context<StopStaking>,toggle:bool) -> Result<()> {
        let staking = &mut ctx.accounts.staking;
        staking.is_live = toggle;
        Ok(())
    }

    pub fn stake_tokens(ctx: Context<Stake>, amount: u64) -> Result<()> {
        msg!("Instruction: Stake");

        let staking = &mut ctx.accounts.staking;
        let user_info = &mut ctx.accounts.staking_data;

        require!(staking.is_live, CustomError::StakingNotLive);
        require!(amount > 0, CustomError::ZeroAmount);

        let cur_timestamp = u64::try_from(Clock::get()?.unix_timestamp).unwrap();

    
        staking.total_tokens_staked = staking.total_tokens_staked.checked_add(amount).ok_or(CustomError::Overflow)?;

        user_info.total_staking_balance = user_info.total_staking_balance.checked_add(amount).ok_or(CustomError::Overflow)?;
        user_info.stake_date = cur_timestamp;
        user_info.owner = ctx.accounts.signer.key();


        transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.signer_token_account.to_account_info(),
                    to: ctx.accounts.staking_token_account.to_account_info(),
                    authority: ctx.accounts.signer.to_account_info(),  
                },
                &[], 
            ),
            amount,
        )?;

        Ok(())
    }

    pub fn unstake_tokens(ctx: Context<Unstake>) -> Result<()> {
        msg!("Instruction: Unstake");
    
        let staking = &mut ctx.accounts.staking;
        require!(!staking.is_locked, CustomError::ClaimLocked);
    
        let user_info = &mut ctx.accounts.staking_data;
        let cur_timestamp = u64::try_from(Clock::get()?.unix_timestamp).unwrap();
    
        let staked_amount = user_info.total_staking_balance;
        let user_share = staked_amount as f64 / staking.total_tokens_staked as f64;
        msg!("user_share {}",user_share);

        // Define the reward structure (monthly increasing rewards)
        let daily_rewards = [
            12671, 13014, 13356, 13699, 14041, 14384, 14726, 15068, 15411, 15753, 16096, 16438
        ];
    
        // Calculate the number of days staked
        let stake_duration_days = (cur_timestamp - user_info.stake_date) / (24 * 60 * 60);
        msg!("stake_duration_days {}",stake_duration_days);
        
        let staking_start_date = staking.staking_start_date; // Assume this is when the staking contract started
        msg!("staking_start_date {}",staking_start_date);
        let mut reward_accumulated: u64 = 0;
    
        let mut remaining_days = stake_duration_days;
        let mut current_month = ((user_info.stake_date - staking_start_date) / (30 * 24 * 60 * 60)) as usize;
        
        while remaining_days > 0 && current_month < daily_rewards.len() {
            let daily_reward = daily_rewards[current_month] as f64;
            let days_in_month = std::cmp::min(remaining_days, 30);
    
            reward_accumulated += (user_share * daily_reward * days_in_month as f64) as u64;
    
            remaining_days -= days_in_month;
            current_month += 1;
        }
    
        msg!("Unstaking {} tokens with {} rewards", staked_amount, reward_accumulated);
    
        user_info.total_staking_balance = user_info.total_staking_balance.checked_sub(staked_amount).ok_or(CustomError::Overflow)?;
        user_info.total_reward_paid = user_info.total_reward_paid.checked_add(reward_accumulated).ok_or(CustomError::Overflow)?;
        staking.total_tokens_staked = staking.total_tokens_staked.checked_sub(staked_amount).ok_or(CustomError::Overflow)?;
    
        let total_payable = staked_amount.checked_add(reward_accumulated).ok_or(CustomError::Overflow)?;
        msg!("Total payable {} tokens", total_payable);
        transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.staking_token_account.to_account_info(),
                    to: ctx.accounts.signer_token_account.to_account_info(),
                    authority: staking.to_account_info(),
                },
                &[&[STAKING_SEED, &[ctx.bumps.staking]]],
            ),
            total_payable
        )?;
    
        Ok(())
    }
   
}

// Constants
pub const STAKING_SEED:&[u8] = "solana_staking".as_bytes();
pub const STAKING_DATA_SEED:&[u8] = "staking_user_data".as_bytes();

#[derive(Accounts)]
pub struct UnlockStaking<'info> {
    #[account(
        mut,
        seeds = [STAKING_SEED],
        bump
    )]
    pub staking: Box<Account<'info, StakingInfo>>,

    #[account(
        mut,
        constraint = signer.key() == staking.authority.key() @ CustomError::Unauthorized,
    )]
    pub signer: Signer<'info>,
}
#[account]
#[derive(Default)]
pub struct StakingInfo {
    pub token_mint: Pubkey,
    pub total_tokens_staked: u64,
    pub total_tokens_rewarded: u64,
    pub staking_start_date: u64,
    pub is_live:bool,
    pub is_locked:bool,
    pub authority:Pubkey
}



#[account]
#[derive(Default)]
pub struct StakingData {
    pub total_staking_balance: u64,
    pub stake_date: u64,
    pub total_reward_paid: u64,
    pub owner: Pubkey,
}


#[derive(Accounts)]
pub struct StopStaking<'info> {
    #[account(
        mut,
        seeds = [STAKING_SEED],
        bump
    )]
    pub staking: Box<Account<'info, StakingInfo>>,

    #[account(
        mut,
        constraint = signer.key() == staking.authority.key() @ CustomError::Unauthorized,
    )]
    pub signer: Signer<'info>,
    
}
#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(
        init_if_needed,
        /*
        Discriminator: 8 bytes
        InvestmentData : size of InvestmentData
         */
        space = 8 +  (10 * std::mem::size_of::<StakingData>()),  
        payer=from,
        seeds=[STAKING_DATA_SEED,from.key().as_ref()],
        bump

    )]
    pub staking_data: Box<Account<'info, StakingData>>,

    #[account(mut)]
    pub from: Signer<'info>,
    #[account(
        mut,
        seeds = [STAKING_SEED],
        bump
    )]
    pub staking: Box<Account<'info,StakingInfo>>,
    



    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = staking.key()
    )]
    pub staking_token_account: Box<Account<'info, TokenAccount>>,
    
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

pub struct Unstake<'info> {
    #[account(
        mut,
        seeds = [STAKING_DATA_SEED, signer.key().as_ref()], 
        bump
    )]
    pub staking_data: Box<Account<'info, StakingData>>,

    #[account(mut)]
    pub from: Signer<'info>,
    #[account(
        mut,
        seeds = [STAKING_SEED],
        bump
    )]
    pub staking: Box<Account<'info,StakingInfo>>,
    



    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = staking.key()
    )]
    pub staking_token_account: Box<Account<'info, TokenAccount>>,
    
    #[account(
        init_if_needed,
        payer = signer,
        associated_token::mint = token_mint,
        associated_token::authority = signer,
    )]
    pub signer_token_account: Box<Account<'info, TokenAccount>>,

 
    #[account(
        mut,
        constraint = signer.key() == staking_data.owner @ CustomError::Unauthorized,
    )]
    pub signer: Signer<'info>,


    #[account(mut)]
    pub token_mint: Box<Account<'info, Mint>>, 
   

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}




#[derive(Accounts)]
pub struct StartStaking<'info> {
    #[account(
        init_if_needed,
        payer = signer,
          /*
        Discriminator: 8 bytes
        StakingInfo : size of StakingInfo
         */
        space=8 + std::mem::size_of::<StakingInfo>(),
        seeds = [STAKING_SEED],
        bump
    )]
    pub staking: Box<Account<'info, StakingInfo>>,
    #[account(
        constraint = token_mint.is_initialized == true,
    )]
    pub token_mint: Box<Account<'info, Mint>>, // Token mint account


    #[account(mut)]
    pub signer: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,

}



#[error_code]
pub enum CustomError {
    #[msg("Staking not live")]
    StakingNotLive,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Staking already stopped")]
    StakingAlreadyStopped,
    #[msg("Zero staking amount")]
    ZeroAmount,
    #[msg("Invalid staking duration")]
    InvalidStakingDuration,
    #[msg("Invalid Staking Id")]
    InvalidStakingId,
    #[msg("Staking is still locked")]
    StakingStillLocked,
    #[msg("Overflow error in reward calculation")]
    Overflow,
    #[msg("ClaimLocked")]
    ClaimLocked,
    #[msg("AlreadyUnlocked")]
    AlreadyUnlocked,
}