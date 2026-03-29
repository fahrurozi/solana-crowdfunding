use anchor_lang::prelude::*;

#[account]
pub struct Campaign {
    pub id: u64,
    pub creator: Pubkey,
    pub goal: u64,
    pub raised: u64,
    pub deadline: i64,
    pub claimed: bool,
    pub bump: u8,
    pub vault_bump: u8,
}