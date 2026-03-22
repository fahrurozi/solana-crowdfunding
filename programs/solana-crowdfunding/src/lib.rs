use anchor_lang::prelude::*;

declare_id!("H4jTQeirHZCXyZuJ5JkMVXQ5mmKKqHQxFkeTrUMzta9K");

#[program]
pub mod solana_crowdfunding {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
