use anchor_lang::prelude::*;

#[account]
pub struct Contribution {
    pub campaign: Pubkey,
    pub donor: Pubkey,
    pub amount: u64,
    pub bump: u8,
}