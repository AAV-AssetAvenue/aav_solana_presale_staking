use anchor_lang::{prelude::*, solana_program};
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{transfer, Mint, Token, TokenAccount, Transfer},
};
use std::str::FromStr;

declare_id!("abKv7EDBx3REPsbgpZVfyn39RH3kBsYUKQy18AfdHf9");

#[program]
pub mod solana_presale {

    use super::*;
    ////////////////////////////////////////////////////////////
    //                        Initializer
    ////////////////////////////////////////////////////////////
    pub fn initializer(
        ctx: Context<Initializer>,
        start_time: u64,
        price_per_token_in_sol: u64,
        price_per_token_in_usdc: u64,
    ) -> Result<()> {
        let presale = &mut ctx.accounts.presale;
        require!(!presale.is_initialized, CustomError::AlreadyInitialized);

        presale.start_time = start_time;
        presale.price_per_token_in_sol = price_per_token_in_sol; // 0.000368664 sol  = 368664
        presale.price_per_token_in_usdc = price_per_token_in_usdc; // 0.000368664 sol  = 368664
        presale.is_live = true;
        presale.is_initialized = true;
        presale.sol_amount_raised = 0;
        presale.token_mint = ctx.accounts.token_mint.key();
        presale.authority = ctx.accounts.signer.key();

        let staking = &mut ctx.accounts.staking;

        let cur_timestamp = u64::try_from(Clock::get()?.unix_timestamp).unwrap();

        staking.total_tokens_staked = 0;
        staking.total_tokens_rewarded = 0;
        staking.token_mint = ctx.accounts.token_mint.key();
        staking.staking_start_date = cur_timestamp;
        staking.allow_claiming = false;
        staking.authority = ctx.accounts.signer.key();

        Ok(())
    }

    ////////////////////////////////////////////////////////////
    //                        User functions
    ////////////////////////////////////////////////////////////

    // function for users to invest in presale using sol and get tokens in return.
    // there is no vesting
    // min investment is 0.5 sol and max investment is 200 sol
    pub fn invest(ctx: Context<Invest>, value: u64, payment_token: u8) -> Result<()> {
        let presale_data = &mut ctx.accounts.presale;
        let user_data = &mut ctx.accounts.data;

        require!(presale_data.is_live, CustomError::PresaleNotLive);

        let cur_timestamp = u64::try_from(Clock::get()?.unix_timestamp).unwrap();

        require!(
            cur_timestamp >= presale_data.start_time,
            CustomError::PresaleNotStarted
        );

        let number_of_tokens = if payment_token == 0 {
            // SOL Payment
            require!(
                value >= 500000000 && value <= 200000000000,
                CustomError::WrongAmount
            );
            value * 100000 / presale_data.price_per_token_in_sol
        } else {
            // USDC Payment
            require!(
                value >= 100_000000 && value <= 40_000_000000,
                CustomError::WrongAmount
            );
            value * 100000 / presale_data.price_per_token_in_usdc
        };

        if payment_token == 0 {
            user_data.sol_investment_amount += value;
            presale_data.sol_amount_raised += value;
        } else {
            user_data.usdc_investment_amount += value;
            presale_data.usdc_amount_raised += value;
        }
        user_data.number_of_tokens += number_of_tokens;
        presale_data.total_tokens_sold += number_of_tokens;

        let from_account = &ctx.accounts.from;
        let presale = presale_data.to_account_info();

        if payment_token == 0 {
            // Transfer Sol from investor to presale account
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
        } else {
            // Transfer USDC from investor to presale account
            transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.signer_usdc_account.to_account_info(),
                        to: ctx.accounts.presale_usdc_account.to_account_info(),
                        authority: ctx.accounts.signer.to_account_info(),
                    },
                ),
                value,
            )?;
        }
        // Transfer Presale Tokens to Investor
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

    pub fn buy_and_stake(ctx: Context<BuyAndStake>, value: u64, payment_token: u8) -> Result<()> {
        let presale_data = &mut ctx.accounts.presale;
        let staking_data = &mut ctx.accounts.staking;
        let user_staking_data = &mut ctx.accounts.staking_data;
        let user_data = &mut ctx.accounts.investment_data;

        require!(presale_data.is_live, CustomError::PresaleNotLive);

        let cur_timestamp = u64::try_from(Clock::get()?.unix_timestamp).unwrap();
        require!(
            cur_timestamp >= presale_data.start_time,
            CustomError::PresaleNotStarted
        );
        if !user_staking_data.is_first_time {
            let cur_timestamp = u64::try_from(Clock::get()?.unix_timestamp).unwrap();
            user_staking_data.stake_date = cur_timestamp;
            user_staking_data.is_first_time = true;
        }

        let number_of_tokens = if payment_token == 0 {
            // SOL Payment
            require!(
                value >= 500000000 && value <= 200000000000,
                CustomError::WrongAmount
            );
            value * 100000 / presale_data.price_per_token_in_sol
        } else {
            // USDC Payment
            require!(
                value >= 100_000000 && value <= 40_000_000000,
                CustomError::WrongAmount
            );
            value * 100000 / presale_data.price_per_token_in_usdc
        };
        if payment_token == 0 {
            user_data.sol_investment_amount += value;
            presale_data.sol_amount_raised += value;
        } else {
            user_data.usdc_investment_amount += value;
            presale_data.usdc_amount_raised += value;
        }

        presale_data.total_tokens_sold += number_of_tokens;

        staking_data.total_tokens_staked += number_of_tokens;

        // Update user staking balance
        user_staking_data.total_staking_balance += number_of_tokens;
        let from_account = &ctx.accounts.from;
        let presale = presale_data.to_account_info();

        if payment_token == 0 {
            // Transfer Sol from investor to presale account
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
        } else {
            // Handle USDC Transfer
            transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.signer_usdc_account.to_account_info(),
                        to: ctx.accounts.presale_usdc_account.to_account_info(),
                        authority: ctx.accounts.signer.to_account_info(),
                    },
                ),
                value,
            )?;
        }

        // Transfer tokens to Staking Contract
        transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.presale_token_account.to_account_info(),
                    to: ctx.accounts.staking_token_account.to_account_info(),
                    authority: ctx.accounts.presale.to_account_info(),
                },
                &[&[PRESALE_SEED, &[ctx.bumps.presale]][..]],
            ),
            number_of_tokens,
        )?;

        Ok(())
    }

    pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
        require!(amount > 0, CustomError::ZeroAmount);

        let staking = &mut ctx.accounts.staking;

        let user_info = &mut ctx.accounts.staking_data;

        if !user_info.is_first_time {
            let cur_timestamp = u64::try_from(Clock::get()?.unix_timestamp).unwrap();
            user_info.stake_date = cur_timestamp;
            user_info.is_first_time = true;
        }

        user_info.total_staking_balance = user_info
            .total_staking_balance
            .checked_add(amount)
            .ok_or(CustomError::Overflow)?;
        staking.total_tokens_staked = staking
            .total_tokens_staked
            .checked_add(amount)
            .ok_or(CustomError::Overflow)?;

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

    // if allow_claiming is true, then this function will be callable
    pub fn unstake_and_claim_rewards(ctx: Context<Unstake>) -> Result<()> {
        let staking = &mut ctx.accounts.staking;
        require!(staking.allow_claiming, CustomError::ClaimLocked);

        let user_info = &mut ctx.accounts.staking_data;
        require!(user_info.total_staking_balance > 0, CustomError::ZeroAmount);

        let user_start_date = user_info.stake_date;

        let staked_amount = user_info.total_staking_balance;
        let total_tokens_staked = staking.total_tokens_staked;

        let user_share = (staked_amount * PRECISION) / total_tokens_staked;

        let cur_timestamp = u64::try_from(Clock::get()?.unix_timestamp).unwrap();
        let time_diff = (cur_timestamp - user_start_date) * PRECISION;

        let stake_duration_days = ((time_diff + (DAY_DURATION / 2)) / DAY_DURATION) as u64;

        let mut reward_accumulated: u64 = 0;
        let mut remaining_days = stake_duration_days;

        let mut current_month = (((user_start_date - staking.staking_start_date) * PRECISION
            + (MONTH_DURATION / 2))
            / MONTH_DURATION) as usize;

        while remaining_days > 0 && current_month < DAILY_REWARDS_LEN {
            let daily_reward = DAILY_REWARDS[current_month];
            let days_in_month = std::cmp::min(remaining_days, 30);

            let scaled_reward = (user_share * daily_reward * days_in_month) / PRECISION;

            reward_accumulated = reward_accumulated
                .checked_add(scaled_reward)
                .ok_or(CustomError::Overflow)?;

            remaining_days = remaining_days
                .checked_sub(days_in_month)
                .ok_or(CustomError::Overflow)?;
            current_month = current_month.checked_add(1).ok_or(CustomError::Overflow)?;
        }

        // Ensure minimum 1-day reward if stake_duration_days > 0 but reward_accumulated is 0
        if stake_duration_days >= 1 && reward_accumulated == 0 {
            let daily_reward = DAILY_REWARDS[0]; // Use first month's reward rate
            let min_reward = (user_share * daily_reward) / PRECISION;
            reward_accumulated = min_reward;
        }

        require!(reward_accumulated > 0, CustomError::NoRewards);
        msg!("Reward accumulated: {}", reward_accumulated);

        let total_payable = staked_amount
            .checked_add(reward_accumulated)
            .ok_or(CustomError::Overflow)?;

        staking.total_tokens_staked = staking
            .total_tokens_staked
            .checked_sub(staked_amount)
            .ok_or(CustomError::Overflow)?;
        staking.total_tokens_rewarded = staking
            .total_tokens_rewarded
            .checked_add(reward_accumulated)
            .ok_or(CustomError::Overflow)?;
        user_info.total_staking_balance = 0;
        user_info.is_first_time = false;

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
            total_payable,
        )?;

        Ok(())
    }

    ////////////////////////////////////////////////////////////
    //                        Admin functions
    ////////////////////////////////////////////////////////////
    pub fn allow_claiming(ctx: Context<UnlockStaking>, toggle: bool) -> Result<()> {
        let staking = &mut ctx.accounts.staking;
        staking.allow_claiming = toggle;
        Ok(())
    }

    pub fn change_price(ctx: Context<StopPresale>, sol_price: u64, usdc_price: u64) -> Result<()> {
        let presale = &mut ctx.accounts.presale;

        presale.price_per_token_in_sol = sol_price;
        presale.price_per_token_in_usdc = usdc_price;
        Ok(())
    }

    pub fn toggle_presale(ctx: Context<StopPresale>, toggle: bool) -> Result<()> {
        let presale = &mut ctx.accounts.presale;

        presale.is_live = toggle;
        Ok(())
    }

    // emergency function for admin to withdraw tokens from staking. should be used in emergency scenario.
    pub fn admin_withdraw_tokens(ctx: Context<AdminWithdrawTokens>) -> Result<()> {
        transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.staking_token_account.to_account_info(),
                    to: ctx.accounts.signer_token_account.to_account_info(),
                    authority: ctx.accounts.staking.to_account_info(),
                },
                &[&[STAKING_SEED, &[ctx.bumps.staking]][..]],
            ),
            ctx.accounts.staking_token_account.amount, //  balance of the staking token account.
        )?;
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

    pub fn admin_withdraw_usdc_and_sol(ctx: Context<AdminWithdrawUsdcSol>) -> Result<()> {
        let usdc_balance = ctx.accounts.presale_usdc_account.amount;
        if usdc_balance > 0 {
            // Transfer USDC to the admin
            transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.presale_usdc_account.to_account_info(),
                        to: ctx.accounts.signer_usdc_account.to_account_info(),
                        authority: ctx.accounts.presale.to_account_info(),
                    },
                    &[&[PRESALE_SEED, &[ctx.bumps.presale]]],
                ),
                usdc_balance,
            )?;
        }
        let presale = &mut ctx.accounts.presale.to_account_info();
        let recipient = &ctx.accounts.signer;

        // Get the minimum rent-exempt balance for the account
        let rent_exemption = Rent::get()?.minimum_balance(presale.data_len());

        let presale_balance = presale.lamports();

        if presale_balance > 0 {
            // Ensure there is enough balance to withdraw after leaving rent
            require!(
                presale_balance > rent_exemption,
                CustomError::InsufficientFunds
            );

            // Calculate the amount to withdraw, leaving the rent-exempt balance
            let amount_to_withdraw = presale_balance - rent_exemption;

            **presale.to_account_info().try_borrow_mut_lamports()? -= amount_to_withdraw;
            **recipient.to_account_info().try_borrow_mut_lamports()? += amount_to_withdraw;
        }

        Ok(())
    }
}

////////////////////////////////////////////////////////////
//                        Constants
////////////////////////////////////////////////////////////
pub const PRESALE_SEED: &[u8] = "solana_presale".as_bytes();
pub const DATA_SEED: &[u8] = "my_data".as_bytes();
pub const STAKING_SEED: &[u8] = "solana_staking".as_bytes();
pub const STAKING_DATA_SEED: &[u8] = "staking_user_data".as_bytes();
pub const USDC_ADDRESS: &str = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
pub const DAILY_REWARDS: [u64; 12] = [
    1205350000, 1237979000, 1270512000, 1303141000, 1335674000, 1368302000, 1400836000, 1433369000,
    1465998000, 1498531000, 1531159000, 1563693000,
];
pub const DAILY_REWARDS_LEN: usize = DAILY_REWARDS.len();
pub const PRECISION: u64 = 100000; // Match token decimals = 5
pub const MONTH_DURATION: u64 = (30 * 24 * 60 * 60) * PRECISION;
pub const DAY_DURATION: u64 = (24 * 60 * 60) * PRECISION;

////////////////////////////////////////////////////////////
//                        Account States
////////////////////////////////////////////////////////////

#[account]
#[derive(Default)]
pub struct StakingInfo {
    pub token_mint: Pubkey,
    pub authority: Pubkey,
    pub total_tokens_staked: u64,
    pub total_tokens_rewarded: u64,
    pub staking_start_date: u64,
    pub allow_claiming: bool,
}

#[account]
#[derive(Default)]
pub struct StakingData {
    pub total_staking_balance: u64,
    pub stake_date: u64,
    pub is_first_time: bool,
}

// Account States
#[account]
#[derive(Default)]
pub struct PresaleInfo {
    pub token_mint: Pubkey,
    pub sol_amount_raised: u64,  // total sol raised
    pub usdc_amount_raised: u64, // total sol raised
    pub total_tokens_sold: u64,  // total token sold
    pub start_time: u64,
    pub price_per_token_in_sol: u64,  // price per token in sol
    pub price_per_token_in_usdc: u64, // price per token in sol
    pub is_live: bool,                // is presale is live
    pub is_initialized: bool,         // is presale is initialized
    pub authority: Pubkey,
}

#[account]
#[derive(Default)]
pub struct InvestmentData {
    pub sol_investment_amount: u64,
    pub usdc_investment_amount: u64,
    pub number_of_tokens: u64,
}

////////////////////////////////////////////////////////////
//                        Contexts
////////////////////////////////////////////////////////////

#[derive(Accounts)]
pub struct Initializer<'info> {
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
        init_if_needed,
        payer = signer,
        associated_token::mint = token_mint,
        associated_token::authority = presale
    )]
    pub presale_token_account: Box<Account<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = signer,
        associated_token::mint = token_mint,
        associated_token::authority = staking
    )]
    pub staking_token_account: Box<Account<'info, TokenAccount>>,
    #[account(
        constraint = token_mint.is_initialized == true,
    )]
    pub token_mint: Box<Account<'info, Mint>>, // Token mint account
    // Presale's USDC Token Account
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = presale
    )]
    pub presale_usdc_account: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub usdc_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub signer: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
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

    #[account(
        mut,
        seeds = [PRESALE_SEED],
        bump
    )]
    pub presale: Box<Account<'info, PresaleInfo>>,

    #[account(mut)]
    pub from: Signer<'info>,
    #[account(mut)]
    pub signer: Signer<'info>,

    // Presale's USDC Token Account
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = presale
    )]
    pub presale_usdc_account: Box<Account<'info, TokenAccount>>,

    // Investor's USDC Token Account
    #[account(
        init_if_needed,
        payer = signer,
        associated_token::mint = usdc_mint,
        associated_token::authority = signer
    )]
    pub signer_usdc_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        // constraint = usdc_mint.key() == Pubkey::from_str(USDC_ADDRESS).map_err(|_| CustomError::InvalidUSDC)? @ CustomError::InvalidUSDC
    )]
    pub usdc_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = presale
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
    pub token_mint: Box<Account<'info, Mint>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Accounts)]
pub struct BuyAndStake<'info> {
    #[account(
        init_if_needed,
        /*
        Discriminator: 8 bytes
        InvestmentData : size of InvestmentData
         */
        space=8 + std::mem::size_of::<InvestmentData>(),
        payer=signer,
        seeds=[DATA_SEED,signer.key().as_ref()],
        bump

    )]
    pub investment_data: Box<Account<'info, InvestmentData>>,

    #[account(
        init_if_needed,
        /*
        Discriminator: 8 bytes
        InvestmentData : size of InvestmentData
         */
        space = 8 +  std::mem::size_of::<StakingData>(),  
        payer=signer,
        seeds=[STAKING_DATA_SEED,signer.key().as_ref()],
        bump

    )]
    pub staking_data: Box<Account<'info, StakingData>>,

    #[account(
        mut,
        seeds = [PRESALE_SEED],
        bump
    )]
    pub presale: Box<Account<'info, PresaleInfo>>,

    #[account(
        mut,
        seeds = [STAKING_SEED],
        bump
    )]
    pub staking: Box<Account<'info, StakingInfo>>,

    #[account(mut)]
    pub from: Signer<'info>,
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(mut)]
    pub token_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = presale
    )]
    pub presale_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = staking
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
        // constraint = usdc_mint.key() == Pubkey::from_str(USDC_ADDRESS).map_err(|_| CustomError::InvalidUSDC)? @ CustomError::InvalidUSDC
    )]
    pub usdc_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = presale
    )]
    pub presale_usdc_account: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = signer,
        associated_token::mint = usdc_mint,
        associated_token::authority = signer
    )]
    pub signer_usdc_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(
        init_if_needed,
        /*
        Discriminator: 8 bytes
        InvestmentData : size of InvestmentData
         */
        space = 8 +  std::mem::size_of::<StakingData>(),  
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
    pub staking: Box<Account<'info, StakingInfo>>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = staking
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
    pub staking: Box<Account<'info, StakingInfo>>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = staking.key()
    )]
    pub staking_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
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
pub struct AdminWithdrawUsdcSol<'info> {
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
    pub presale: Box<Account<'info, PresaleInfo>>,

    // Presale's USDC Token Account (from where USDC is withdrawn)
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = presale
    )]
    pub presale_usdc_account: Box<Account<'info, TokenAccount>>,

    // Admin's USDC Token Account (where USDC is sent)
    #[account(
        init_if_needed,
        payer = signer,
        associated_token::mint = usdc_mint,
        associated_token::authority = signer
    )]
    pub signer_usdc_account: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub usdc_mint: Box<Account<'info, Mint>>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Accounts)]
pub struct AdminWithdrawTokens<'info> {
    #[account(
        mut,
        constraint = signer.key() == staking.authority.key() @ CustomError::Unauthorized,
    )]
    pub signer: Signer<'info>,
    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = staking.key()
    )]
    pub staking_token_account: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = presale.key()
    )]
    pub presale_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [PRESALE_SEED],
        bump,
    )]
    pub presale: Box<Account<'info, PresaleInfo>>,
    #[account(
        init_if_needed,
        payer = signer,
        associated_token::mint = token_mint,
        associated_token::authority = signer,
    )]
    pub signer_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [STAKING_SEED],
        bump
    )]
    pub staking: Box<Account<'info, StakingInfo>>,

    #[account(mut)]
    pub token_mint: Box<Account<'info, Mint>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Accounts)]
pub struct UnlockStaking<'info> {
    #[account(
        mut,
        constraint = signer.key() == staking.authority.key() @ CustomError::Unauthorized,
    )]
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [STAKING_SEED],
        bump
    )]
    pub staking: Box<Account<'info, StakingInfo>>,
}

#[derive(Accounts)]
pub struct StopPresale<'info> {
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
    pub presale: Box<Account<'info, PresaleInfo>>,
}

////////////////////////////////////////////////////////////
//                        Custom Errors
////////////////////////////////////////////////////////////
#[error_code]
pub enum CustomError {
    #[msg("Insufficient funds")]
    InsufficientFunds,
    #[msg("Presale not live")]
    PresaleNotLive,
    #[msg("Presale not started")]
    PresaleNotStarted,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("AlreadyInitialized")]
    AlreadyInitialized,
    #[msg("WrongTime")]
    WrongTime,
    #[msg("WrongAmount")]
    WrongAmount,
    #[msg("Invalid USDC")]
    InvalidUSDC, //  wrong USDC mint
    #[msg("Overflow error in reward calculation")]
    Overflow,
    #[msg("Zero staking amount")]
    ZeroAmount,
    #[msg("ClaimLocked")]
    ClaimLocked,
    #[msg("NoRewards")]
    NoRewards,
}
