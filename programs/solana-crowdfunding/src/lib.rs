use anchor_lang::prelude::*;

pub mod state;
pub mod errors;

use crate::{
    errors::CrowdfundingError,
    state::{Campaign, Contribution},
};

declare_id!("H4jTQeirHZCXyZuJ5JkMVXQ5mmKKqHQxFkeTrUMzta9K");



#[program]
pub mod solana_crowdfunding {
    use super::*;

    pub fn create_campaign(
        ctx: Context<CreateCampaign>,
        goal: u64,
        deadline: i64,
    ) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;

        // Validate input parameters
        let clock = Clock::get()?;
        if deadline <= clock.unix_timestamp {
            return err!(CrowdfundingError::InvalidDeadline);
        }
        if goal == 0 {
            return err!(CrowdfundingError::InvalidGoal);
        }

        // Initialize campaign state
        campaign.creator = *ctx.accounts.creator.key;
        campaign.goal = goal;
        campaign.raised = 0;
        campaign.deadline = deadline;
        campaign.claimed = false;
        campaign.bump = ctx.bumps.campaign;
        campaign.vault_bump = ctx.bumps.vault;

        msg!("Campaign created with goal: {} and deadline: {}", goal, deadline);

        Ok(())
    }

    pub fn contribute(ctx: Context<Contribute>, amount: u64) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;

        // Validate contribution
        let clock = Clock::get()?;
        if clock.unix_timestamp >= campaign.deadline {
            return err!(CrowdfundingError::CampaignEnded);
        }
        if amount == 0 {
            return err!(CrowdfundingError::InvalidContributionAmount);
        }

        let contribution = &mut ctx.accounts.contribution;

        contribution.campaign = campaign.key();
        contribution.donor = *ctx.accounts.contributor.key;
        contribution.amount = contribution.amount.checked_add(amount).ok_or(CrowdfundingError::Overflow)?;
        contribution.bump = ctx.bumps.contribution;
        
        campaign.raised = campaign.raised.checked_add(amount).ok_or(CrowdfundingError::Overflow)?;

        msg!("{} contributed {} lamports to campaign {}", ctx.accounts.contributor.key(), amount, campaign.key());
        
        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateCampaign<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
     #[account(
        init,
        payer = creator,
        space = 8 + 32 + 8 + 8 + 8 + 1 + 1 + 1,
        seeds = [b"campaign", creator.key().as_ref()],
        bump
    )]
    pub campaign: Account<'info, Campaign>,
    /// CHECK: Vault PDA for storing SOL, no data is read or written
    #[account(
    init,
        payer = creator,
        space = 8,
        seeds = [b"vault", campaign.key().as_ref()],
        bump
    )]
    pub vault: UncheckedAccount<'info>,
    
    pub system_program: Program<'info, System>,
}


#[derive(Accounts)]
pub struct Contribute<'info> {
    #[account(mut)]
    pub contributor: Signer<'info>,
     #[account(
        mut,
        seeds = [
            b"campaign",
            campaign.creator.as_ref()
        ],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, Campaign>,
    #[account(
        mut,
        seeds = [b"vault", campaign.key().as_ref()],
        bump
    )]
    pub vault: SystemAccount<'info>,
    #[account(
        init_if_needed,
        payer = contributor,
        space = 8 + 32 + 32 + 8 + 1,
        seeds = [
            b"contribution",
            campaign.key().as_ref(),
            contributor.key().as_ref()
        ],
        bump
    )]
    pub contribution: Account<'info, Contribution>,
    pub system_program: Program<'info, System>,
}
    
