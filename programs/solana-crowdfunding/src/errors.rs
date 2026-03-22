use anchor_lang::prelude::*;

#[error_code]
pub enum CrowdfundingError {
    #[msg("Deadline must be in the future")]
    InvalidDeadline,
    #[msg("Goal must be greater than zero")]
    InvalidGoal,
    #[msg("Contribution amount must be greater than zero")]
    InvalidContributionAmount,
    #[msg("Campaign has already ended")]
    CampaignEnded,
    #[msg("Deadline has not been reached yet")]
    DeadlineNotReached,
    #[msg("Campaign goal has not been reached")]
    GoalNotReached,
    #[msg("Campaign goal was reached, refund is not allowed")]
    GoalAlreadyReached,
    #[msg("Only the campaign creator can perform this action")]
    Unauthorized,
    #[msg("Campaign funds have already been claimed")]
    AlreadyClaimed,
    #[msg("Nothing to refund")]
    NothingToRefund,
    #[msg("Arithmetic overflow or underflow")]
    Overflow,
    #[msg("Vault balance is insufficient for this transfer")]
    InsufficientVaultBalance,
}
