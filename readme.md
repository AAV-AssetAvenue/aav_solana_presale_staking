# Solana Presale and Staking Program

## Overview
This Solana program implements a **Presale and Staking Contract** that allows users to:
- Participate in a **token presale** using **SOL** or **USDC**.
- **Stake** their purchased tokens to earn rewards over time.
- **Withdraw staked tokens and claim rewards** when the admin enables withdrawals.
- **Admins** can control various settings, including presale prices, claiming permissions, and emergency withdrawals.

## Features
- **Token Presale:** Users can buy tokens using SOL or USDC at a fixed price.
- **Staking Mechanism:** Users can stake their tokens to earn rewards over time.
- **Unstake & Claim Rewards:** Once claiming is enabled, users can withdraw their staked tokens and accumulated rewards.
- **Admin Controls:** Admins can toggle the presale, modify prices, and withdraw funds in case of emergency.

---

## Smart Contract Functions

### **1. Initializer**
Initializes the presale and staking system.
```rust
pub fn initializer(
    ctx: Context<Initializer>,
    start_time: u64,
    price_per_token_in_sol: u64,
    price_per_token_in_usdc: u64,
) -> Result<()>
```

### **2. Invest**
Allows users to invest in the presale by sending SOL or USDC in exchange for tokens.
```rust
pub fn invest(ctx: Context<Invest>, value: u64, payment_token: u8) -> Result<()>
```
- `payment_token = 0` → SOL Payment
- `payment_token = 1` → USDC Payment
- Min Investment: **0.5 SOL** / **100 USDC**
- Max Investment: **200 SOL** / **40,000 USDC**

### **3. Buy and Stake**
Allows users to buy tokens and immediately stake them in one transaction.
```rust
pub fn buy_and_stake(ctx: Context<BuyAndStake>, value: u64, payment_token: u8) -> Result<()>
```

### **4. Stake**
Allows users to manually stake their tokens.
```rust
pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()>
```

### **5. Unstake and Claim Rewards**
Allows users to unstake their tokens and claim rewards if claiming is enabled.
```rust
pub fn unstake_and_claim_rewards(ctx: Context<Unstake>) -> Result<()>
```

### **6. Admin Controls**
#### Toggle Presale
Enable or disable the presale.
```rust
pub fn toggle_presale(ctx: Context<StopPresale>, toggle: bool) -> Result<()>
```

#### Update Token Address
Update the token mint address.
```rust
pub fn update_token_address(ctx: Context<UpdateTokenAddress>) -> Result<()>
```

#### Change Price
Change the price of the token.
```rust
pub fn change_price(ctx: Context<StopPresale>, sol_price: u64, usdc_price: u64) -> Result<()>
```

#### Enable Claiming
Enable or disable staking reward claims.
```rust
pub fn allow_claiming(ctx: Context<UnlockStaking>, toggle: bool) -> Result<()>
```

#### Emergency Withdraw
Admin can withdraw all USDC, SOL, or staked tokens in case of emergency.
```rust
pub fn admin_withdraw_tokens(ctx: Context<AdminWithdrawTokens>) -> Result<()>
```
```rust
pub fn admin_withdraw_usdc_and_sol(ctx: Context<AdminWithdrawUsdcSol>) -> Result<()>
```

---

## Account Structures
### **PresaleInfo**
Stores presale details.
```rust
pub struct PresaleInfo {
    pub token_mint: Pubkey,
    pub sol_amount_raised: u64,
    pub usdc_amount_raised: u64,
    pub total_tokens_sold: u64,
    pub start_time: u64,
    pub price_per_token_in_sol: u64,
    pub price_per_token_in_usdc: u64,
    pub is_live: bool,
    pub is_initialized: bool,
    pub authority: Pubkey,
}
```

### **StakingInfo**
Stores staking-related details.
```rust
pub struct StakingInfo {
    pub token_mint: Pubkey,
    pub authority: Pubkey,
    pub total_tokens_staked: u64,
    pub total_tokens_rewarded: u64,
    pub staking_start_date: u64,
    pub allow_claiming: bool,
}
```

### **InvestmentData**
Stores user's investment history.
```rust
pub struct InvestmentData {
    pub sol_investment_amount: u64,
    pub usdc_investment_amount: u64,
    pub number_of_tokens: u64,
}
```

### **StakingData**
Stores user's staking details.
```rust
pub struct StakingData {
    pub total_staking_balance: u64,
    pub stake_date: u64,
    pub is_first_time: bool,
}
```

---

## Constants
```rust
pub const PRESALE_SEED: &[u8] = "solana_presale".as_bytes();
pub const STAKING_SEED: &[u8] = "solana_staking".as_bytes();
pub const USDC_ADDRESS: &str = "4Fa3EWgea8bYwFjRdAxn9b7FhzFSYZR41Tnkn39SvSLX";
pub const DAILY_REWARDS: [u64; 12] = [
    1205350000, 1237979000, 1270512000, 1303141000,
    1335674000, 1368302000, 1400836000, 1433369000,
    1465998000, 1498531000, 1531159000, 1563693000,
];
```

---

## Custom Errors
```rust
pub enum CustomError {
    #[msg("Insufficient funds")] InsufficientFunds,
    #[msg("Presale not live")] PresaleNotLive,
    #[msg("Presale not started")] PresaleNotStarted,
    #[msg("Unauthorized")] Unauthorized,
    #[msg("AlreadyInitialized")] AlreadyInitialized,
    #[msg("Wrong Amount")] WrongAmount,
    #[msg("Invalid Token")] InvalidToken,
    #[msg("Overflow error in reward calculation")] Overflow,
    #[msg("Zero staking amount")] ZeroAmount,
    #[msg("Staking not live")] StakingNotLive,
    #[msg("Claim Locked")] ClaimLocked,
    #[msg("No Rewards")] NoRewards,
}
```

---




## Staking Logic
```shell
User share= User staked tokens / total staked tokens
User Rewards=User share x Daily Reward

The linear growth curve is like this:
Linear Growth Curve:

Month	Daily Rewards (tokens)	Monthly Total (tokens)
Month 1	- 12,671 tokens/day	380,125 tokens
Month 2	-  13,014 tokens/day	390,375 tokens
Month 3	- 13,356 tokens/day	400,750 tokens
Month 4	- 13,699 tokens/day	411,000 tokens
Month 5	- 14,041 tokens/day	421,250 tokens
Month 6	- 14,384 tokens/day	431,500 tokens
Month 7	- 14,726 tokens/day	441,775 tokens
Month 8	- 15,068 tokens/day	452,125 tokens
Month 9	- 15,411 tokens/day 462,375 tokens
Month 10 - 15,753 tokens/day 472,375 tokens
Month 11	- 16,096 tokens/day	482,875 tokens
Month 12	- 16,438 tokens/day	493,125 tokens
This ads up to 5.000.000 AAV
```





## deployment cost
```shell
- contract deployment cost 10.11265 sol
- network fee 0.00016

- 3.33786sol
- network fee 0.00001


- initialization cost 0.00748 sol
- network fee 0.00016
```