use anchor_lang::prelude::*;
use anchor_lang::system_program;

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
        id: u64,
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
        campaign.id = id;
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

            // code transfer lamports from contributor to vault
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.contributor.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            amount,
        )?;


        let contribution = &mut ctx.accounts.contribution;

        contribution.campaign = campaign.key();
        contribution.donor = *ctx.accounts.contributor.key;
        contribution.amount = contribution.amount.checked_add(amount).ok_or(CrowdfundingError::Overflow)?;
        contribution.bump = ctx.bumps.contribution;
        
        campaign.raised = campaign.raised.checked_add(amount).ok_or(CrowdfundingError::Overflow)?;

        msg!("{} contributed {} lamports to campaign {}", ctx.accounts.contributor.key(), amount, campaign.key());
        
        Ok(())
    }

    pub fn withdraw(ctx : Context<Withdraw>) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;

        // Validate withdrawal conditions
        let clock = Clock::get()?;
        if clock.unix_timestamp < campaign.deadline {
            return err!(CrowdfundingError::DeadlineNotReached);
        }
        if campaign.raised < campaign.goal {
            return err!(CrowdfundingError::GoalNotReached);
        }
        if campaign.claimed {
            return err!(CrowdfundingError::AlreadyClaimed);
        }
        system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.creator.to_account_info(),
                },
                &[&[b"vault", campaign.key().as_ref(), &[campaign.vault_bump]]],
            ),
            ctx.accounts.vault.lamports(),
        )?;

        // Mark campaign as claimed
        campaign.claimed = true;

        msg!("Campaign {} funds withdrawn by creator {}", campaign.key(), ctx.accounts.creator.key());

        Ok(())
    }

    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        let contribution = &mut ctx.accounts.contribution;

        // Validate refund conditions
        let clock = Clock::get()?;
        if clock.unix_timestamp < campaign.deadline {
            return err!(CrowdfundingError::DeadlineNotReached);
        }
        if campaign.raised >= campaign.goal {
            return err!(CrowdfundingError::GoalAlreadyReached);
        }
        if contribution.amount == 0 {
            return err!(CrowdfundingError::NothingToRefund);
        }

        let transfer_amount = if campaign.raised == contribution.amount {
            ctx.accounts.vault.lamports()
        } else {
            contribution.amount
        };

        system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.contributor.to_account_info(),
                },
                &[&[b"vault", campaign.key().as_ref(), &[campaign.vault_bump]]],
            ),
            transfer_amount,
        )?;

        // Update campaign and contribution state
        campaign.raised = campaign.raised.checked_sub(contribution.amount).ok_or(CrowdfundingError::Overflow)?;
        contribution.amount = 0;

        msg!("{} refunded {} lamports from campaign {}", ctx.accounts.contributor.key(), contribution.amount, campaign.key());

        Ok(())
    }


}

#[derive(Accounts)]
#[instruction(id: u64)]
pub struct CreateCampaign<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
     #[account(
        init,
        payer = creator,
        space = 8 + 8 + 32 + 8 + 8 + 8 + 1 + 1 + 1,
        seeds = [b"campaign", creator.key().as_ref(), id.to_le_bytes().as_ref()],
        bump
    )]
    pub campaign: Account<'info, Campaign>,
    /// CHECK: Vault PDA for storing SOL, no data is read or written
    #[account(
        seeds = [b"vault", campaign.key().as_ref()],
        bump
    )]
    pub vault: SystemAccount<'info>,
    
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
            campaign.creator.as_ref(),
            campaign.id.to_le_bytes().as_ref()
        ],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, Campaign>,
    #[account(
        mut,
        seeds = [b"vault", campaign.key().as_ref()],
        bump = campaign.vault_bump
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

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        mut,
        has_one = creator,
        seeds = [
            b"campaign",
            creator.key().as_ref(),
            campaign.id.to_le_bytes().as_ref()
        ],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, Campaign>,
    #[account(
        mut,
        seeds = [b"vault", campaign.key().as_ref()],
        bump = campaign.vault_bump
    )]
    pub vault: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Refund<'info> {
    #[account(mut)]
    pub contributor: Signer<'info>,
    #[account(
        mut,
        seeds = [
            b"campaign",
            campaign.creator.as_ref(),
            campaign.id.to_le_bytes().as_ref()
        ],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, Campaign>,
    #[account(
        mut,
        seeds = [b"vault", campaign.key().as_ref()],
        bump = campaign.vault_bump
    )]
    pub vault: SystemAccount<'info>,
    #[account(
        mut,
        seeds = [
            b"contribution",
            campaign.key().as_ref(),
            contributor.key().as_ref()

        ],
        bump = contribution.bump
    )]
    pub contribution: Account<'info, Contribution>,
    pub system_program: Program<'info, System>,
}
