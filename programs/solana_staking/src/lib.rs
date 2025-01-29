use anchor_lang::prelude::*;
use anchor_spl::{associated_token::AssociatedToken, token::{transfer, Mint, Token, TokenAccount, Transfer}};
declare_id!("G7n94bhEkqKwBkgqVALJ2AzPrugaca5XH2pWw3xy88xB");




#[program]
pub mod solana_staking {

    use super::*;
    pub fn initializer(
        ctx: Context<StartStaking>
    ) -> Result<()> {
        msg!("Instruction: Initialize");
        let staking = &mut ctx.accounts.staking;

        staking.is_live = true;
        staking.total_tokens_staked = 0;
        staking.token_mint =  ctx.accounts.token_mint.key();
        staking.authority = ctx.accounts.signer.key();
        Ok(())
    }
  
    pub fn stop_staking(ctx: Context<StopStaking>) -> Result<()> {
        
        let staking = &mut ctx.accounts.staking;
        require!(!staking.is_live, CustomError::StakingAlreadyStopped); 

        staking.is_live = false;
        Ok(())
    }
  
    pub fn stake_tokens(ctx: Context<Stake>, amount: u64,duration:u64) -> Result<()> {
        msg!("Instruction: Stake");

        let staking = &mut ctx.accounts.staking;
        let user_info = &mut ctx.accounts.staking_data;

        require!(staking.is_live, CustomError::StakingNotLive);

        require!(amount > 0, CustomError::ZeroAmount);
        
        let cur_timestamp = u64::try_from(Clock::get()?.unix_timestamp).unwrap();

        require!(duration >= MIN_STAKING_DURATION &&
            duration <= MAX_STAKING_DURATION, CustomError::InvalidStakingDuration);
       
        staking.total_tokens_staked += amount;
        staking.staking_id += 1;
        
        user_info.total_staking_balance += amount;
        user_info.stakes.push(UserStakingData{
            id : staking.staking_id,
            locked_from :  cur_timestamp,
            locked_until : duration + cur_timestamp,
            token_staking_amount : amount
        });

        transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from:ctx.accounts.signer_token_account.to_account_info(),
                    to:  ctx.accounts.staking_token_account.to_account_info(),
                    authority: ctx.accounts.staking.to_account_info(),
                },
                &[],
            ),
            amount,
        )?;
        
        Ok(())
    }
    pub fn unstake_tokens(ctx: Context<Unstake>, staking_id: u64) -> Result<()> {
        msg!("Instruction: Unstake");
    
        let staking = &mut ctx.accounts.staking;
        let user_info = &mut ctx.accounts.staking_data;
        let cur_timestamp = u64::try_from(Clock::get()?.unix_timestamp).unwrap();
    
        let stake_index = user_info.stakes.iter().position(|s| s.id == staking_id);
        
        require!(stake_index.is_some(), CustomError::InvalidStakingId);
        
        let stake_index = stake_index.unwrap();
        let user_stake = &user_info.stakes[stake_index];
    
        require!(cur_timestamp >= user_stake.locked_until, CustomError::StakingStillLocked);
    
        let staked_amount = user_stake.token_staking_amount;
        let staking_duration = user_stake.locked_until - user_stake.locked_from;
    
        // Linear Reward Calculation
        let reward_rate = MIN_REWARD_RATE + 
            ((MAX_REWARD_RATE - MIN_REWARD_RATE) * (staking_duration - MIN_STAKING_DURATION)) /
            (MAX_STAKING_DURATION - MIN_STAKING_DURATION);
    
        let reward = (staked_amount * reward_rate) / 100;
    
        msg!("Unstaking {} tokens with {} rewards", staked_amount, reward);
    
        // Remove stake entry from user staking data
        user_info.stakes.remove(stake_index);
        user_info.total_staking_balance -= staked_amount;
    
        staking.total_tokens_staked -= staked_amount;
    
        // Transfer staked tokens + reward back to the user
        let seeds = &[STAKING_SEED, &[ctx.bumps.staking]];
        let signer_seeds = &[&seeds[..]];
    
        transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.staking_token_account.to_account_info(),
                    to: ctx.accounts.signer_token_account.to_account_info(),
                    authority: ctx.accounts.staking.to_account_info(),
                },
                signer_seeds,
            ),
            staked_amount + reward,
        )?;
    
        Ok(())
    }

    
}

// constants
pub const STAKING_SEED:&[u8] = "solana_staking".as_bytes();
pub const STAKING_DATA_SEED:&[u8] = "staking_user_data".as_bytes();
pub const MIN_STAKING_DURATION: u64 = 180 * 24 * 60 * 60; // 180 days
pub const MAX_STAKING_DURATION: u64 = 365 * 24 * 60 * 60; // 365 days
pub const MIN_REWARD_RATE: u64 = 258;  // 258.91% for 180 days
pub const MAX_REWARD_RATE: u64 = 599;  // 599.99% for 365 days

#[account]
#[derive(Default)]
pub struct StakingInfo {
    pub token_mint: Pubkey,
    pub total_tokens_staked: u64,
    pub staking_id: u64, //global staking counter
    pub is_live:bool,
    pub authority:Pubkey
}

#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone)]
pub struct UserStakingData {
    pub token_staking_amount: u64,
    pub locked_from: u64,
    pub locked_until: u64,
    pub id: u64,
}


#[account]
#[derive(Default)]
pub struct StakingData {
    pub stakes:Vec<UserStakingData>,
    pub total_staking_balance: u64
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
        space=8 + std::mem::size_of::<StakingData>(),
        payer=from,
        seeds=[STAKING_DATA_SEED,from.key().as_ref(),staking.staking_id.to_le_bytes().as_ref()],
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
        seeds = [STAKING_DATA_SEED,signer.key().as_ref(),staking.staking_id.to_le_bytes().as_ref()],
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
    #[msg("zero staking amount")]
    ZeroAmount,
    #[msg("invalid staking duration")]
    InvalidStakingDuration,
    #[msg("Invalid Staking Id")]
    InvalidStakingId,
    #[msg("Invalid Staking Id")]
    StakingStillLocked,
}