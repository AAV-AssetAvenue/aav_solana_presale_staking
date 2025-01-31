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
        staking.allow_claiming = false;
        Ok(())
    }
    pub fn allow_claiming(ctx: Context<UnlockStaking>,toggle:bool) -> Result<()> {
        let staking = &mut ctx.accounts.staking;
        staking.allow_claiming = toggle;    
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
        require!(staking.allow_claiming, CustomError::ClaimLocked);
        
        let user_info = &mut ctx.accounts.staking_data;
        let cur_timestamp = u64::try_from(Clock::get()?.unix_timestamp).unwrap();
        
        let staked_amount = user_info.total_staking_balance;
        let user_share = (staked_amount * PRECISION) / staking.total_tokens_staked;
        
        let time_diff = (cur_timestamp - user_info.stake_date) * TIME_PRECISION;
        let staking_start_date = staking.staking_start_date;
        
       
        
        // Use scaled values to prevent precision loss
        let stake_duration_days = ((time_diff + (DAY_DURATION / 2)) / DAY_DURATION) as u64;
        
        let mut reward_accumulated: u64 = 0;
        let mut remaining_days = stake_duration_days;
        
        let mut current_month = (((user_info.stake_date - staking_start_date) * TIME_PRECISION + (MONTH_DURATION / 2)) / MONTH_DURATION) as usize;
        
        while remaining_days > 0 && current_month < DAILY_REWARDS_LEN {
            let daily_reward = DAILY_REWARDS[current_month];
            let days_in_month = std::cmp::min(remaining_days, 30);
        
            let scaled_reward = (user_share * daily_reward * days_in_month) / PRECISION;
        
            reward_accumulated = reward_accumulated
                .checked_add(scaled_reward)
                .ok_or(CustomError::Overflow)?;
        
            remaining_days = remaining_days.checked_sub(days_in_month).ok_or(CustomError::Overflow)?;
            current_month = current_month.checked_add(1).ok_or(CustomError::Overflow)?;
        }

        // Ensure minimum 1-day reward if stake_duration_days > 0 but reward_accumulated is 0
        if stake_duration_days >= 1 && reward_accumulated == 0 {
            let daily_reward = DAILY_REWARDS[0]; // Use first month's reward rate
            let min_reward = (user_share * daily_reward) / PRECISION;
            reward_accumulated = min_reward;
        }
        
        let total_payable = staked_amount
            .checked_add(reward_accumulated)
            .ok_or(CustomError::Overflow)?;

        
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
pub const DAILY_REWARDS:[u64; 12] = [
    12671000000, 13014000000, 13356000000, 13699000000, 14041000000, 14384000000, 14726000000, 15068000000, 15411000000, 15753000000, 16096000000, 16438000000
];
pub const DAILY_REWARDS_LEN:usize = DAILY_REWARDS.len();
pub const PRECISION:u64 = 1_000_000; // Match token decimals
const TIME_PRECISION: u64 = 1_000_000; // Scaling factor for precise time calculations
pub const MONTH_DURATION:u64 = (30 * 24 * 60 * 60) * TIME_PRECISION;
pub const DAY_DURATION:u64 = (24 * 60 * 60) * TIME_PRECISION;
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
    pub allow_claiming:bool,
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