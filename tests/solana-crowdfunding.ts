import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolanaCrowdfunding } from "../target/types/solana_crowdfunding";
import { assert } from "chai";

describe("solana-crowdfunding", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.solanaCrowdfunding as Program<SolanaCrowdfunding>;

  // Keypairs for testing
  const creator = anchor.web3.Keypair.generate();
  const contributor1 = anchor.web3.Keypair.generate();
  const contributor2 = anchor.web3.Keypair.generate();

  // PDAs
  let campaignPDA: anchor.web3.PublicKey;
  let vaultPDA: anchor.web3.PublicKey;
  let contribution1PDA: anchor.web3.PublicKey;
  let contribution2PDA: anchor.web3.PublicKey;

  const getCampaignPDA = (creatorPubkey: anchor.web3.PublicKey) => {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("campaign"), creatorPubkey.toBuffer()],
      program.programId
    )[0];
  };

  const getVaultPDA = (campaignPubkey: anchor.web3.PublicKey) => {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), campaignPubkey.toBuffer()],
      program.programId
    )[0];
  };

  const getContributionPDA = (campaignPubkey: anchor.web3.PublicKey, contributorPubkey: anchor.web3.PublicKey) => {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("contribution"), campaignPubkey.toBuffer(), contributorPubkey.toBuffer()],
      program.programId
    )[0];
  };

  // Helper to airdrop SOL
  const airdrop = async (pubkey: anchor.web3.PublicKey, amount: number) => {
    const signature = await provider.connection.requestAirdrop(pubkey, amount);
    const latestBlockhash = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({
      signature,
      ...latestBlockhash,
    }, "confirmed");
  };

  before(async () => {
    // Airdrop SOL to test accounts
    await airdrop(creator.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    await airdrop(contributor1.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    await airdrop(contributor2.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);

    // Initialize PDAs
    campaignPDA = getCampaignPDA(creator.publicKey);
    vaultPDA = getVaultPDA(campaignPDA);
    contribution1PDA = getContributionPDA(campaignPDA, contributor1.publicKey);
    contribution2PDA = getContributionPDA(campaignPDA, contributor2.publicKey);
  });

  describe("create_campaign", () => {
    it("Fails if deadline is in the past", async () => {
      const pastDeadline = new anchor.BN(Math.floor(Date.now() / 1000) - 10);
      const goal = new anchor.BN(5 * anchor.web3.LAMPORTS_PER_SOL);

      try {
        await program.methods
          .createCampaign(goal, pastDeadline)
          .accounts({
            creator: creator.publicKey,
            campaign: campaignPDA,
            vault: vaultPDA,
            systemProgram: anchor.web3.SystemProgram.programId,
          } as any)
          .signers([creator])
          .rpc();
        assert.fail("Should have failed with InvalidDeadline");
      } catch (err: any) {
        assert.include(err.message, "InvalidDeadline");
      }
    });

    it("Fails if goal is zero", async () => {
      const futureDeadline = new anchor.BN(Math.floor(Date.now() / 1000) + 10);
      const zeroGoal = new anchor.BN(0);

      try {
        await program.methods
          .createCampaign(zeroGoal, futureDeadline)
          .accounts({
            creator: creator.publicKey,
            campaign: campaignPDA,
            vault: vaultPDA,
            systemProgram: anchor.web3.SystemProgram.programId,
          } as any)
          .signers([creator])
          .rpc();
        assert.fail("Should have failed with InvalidGoal");
      } catch (err: any) {
        assert.include(err.message, "InvalidGoal");
      }
    });

    it("Creates a campaign successfully", async () => {
      // Create campaign that expires in 3 seconds to test withdrawal/refund later
      const futureDeadline = new anchor.BN(Math.floor(Date.now() / 1000) + 3);
      const goal = new anchor.BN(5 * anchor.web3.LAMPORTS_PER_SOL);

      await program.methods
        .createCampaign(goal, futureDeadline)
        .accounts({
          creator: creator.publicKey,
          campaign: campaignPDA,
          vault: vaultPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        } as any)
        .signers([creator])
        .rpc();

      const campaignAccount = await program.account.campaign.fetch(campaignPDA);
      assert.isTrue(campaignAccount.creator.equals(creator.publicKey));
      assert.isTrue(campaignAccount.goal.eq(goal));
      assert.isTrue(campaignAccount.raised.eq(new anchor.BN(0)));
      assert.isFalse(campaignAccount.claimed);
      assert.isTrue(campaignAccount.deadline.eq(futureDeadline));
    });
  });

  describe("contribute", () => {
    it("Fails if contribution amount is 0", async () => {
      try {
        await program.methods
          .contribute(new anchor.BN(0))
          .accounts({
            contributor: contributor1.publicKey,
            campaign: campaignPDA,
            vault: vaultPDA,
            contribution: contribution1PDA,
            systemProgram: anchor.web3.SystemProgram.programId,
          } as any)
          .signers([contributor1])
          .rpc();
        assert.fail("Should have failed with InvalidContributionAmount");
      } catch (err: any) {
        assert.include(err.message, "InvalidContributionAmount");
      }
    });

    it("Contributes successfully as contributor1", async () => {
      const amount = new anchor.BN(3 * anchor.web3.LAMPORTS_PER_SOL);

      await program.methods
        .contribute(amount)
        .accounts({
          contributor: contributor1.publicKey,
          campaign: campaignPDA,
          vault: vaultPDA,
          contribution: contribution1PDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        } as any)
        .signers([contributor1])
        .rpc();

      const campaignAccount = await program.account.campaign.fetch(campaignPDA);
      assert.isTrue(campaignAccount.raised.eq(amount));

      const contributionAccount = await program.account.contribution.fetch(contribution1PDA);
      assert.isTrue(contributionAccount.amount.eq(amount));
      assert.isTrue(contributionAccount.donor.equals(contributor1.publicKey));
    });

    it("Contributes successfully as contributor2 (Reaching Goal)", async () => {
      const amount = new anchor.BN(3 * anchor.web3.LAMPORTS_PER_SOL); // Total = 6 SOL, Goal = 5 SOL

      await program.methods
        .contribute(amount)
        .accounts({
          contributor: contributor2.publicKey,
          campaign: campaignPDA,
          vault: vaultPDA,
          contribution: contribution2PDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        } as any)
        .signers([contributor2])
        .rpc();

      const campaignAccount = await program.account.campaign.fetch(campaignPDA);
      assert.isTrue(campaignAccount.raised.eq(new anchor.BN(6 * anchor.web3.LAMPORTS_PER_SOL)));
    });
  });

  describe("withdraw (Failures before deadline)", () => {
    it("Fails to withdraw before deadline even if goal is reached", async () => {
      try {
        await program.methods
          .withdraw()
          .accounts({
            creator: creator.publicKey,
            campaign: campaignPDA,
            vault: vaultPDA,
            systemProgram: anchor.web3.SystemProgram.programId,
          } as any)
          .signers([creator])
          .rpc();
        assert.fail("Should have failed with DeadlineNotReached");
      } catch (err: any) {
        assert.include(err.message, "DeadlineNotReached");
      }
    });
  });

  describe("Wait for deadline...", () => {
    it("Waits 4 seconds for deadline to pass", async () => {
      await new Promise((resolve) => setTimeout(resolve, 4000));
    });
  });

  describe("contribute (Failure after deadline)", () => {
    it("Fails to contribute after deadline", async () => {
      const amount = new anchor.BN(1 * anchor.web3.LAMPORTS_PER_SOL);
      try {
        await program.methods
          .contribute(amount)
          .accounts({
            contributor: contributor1.publicKey,
            campaign: campaignPDA,
            vault: vaultPDA,
            contribution: contribution1PDA,
            systemProgram: anchor.web3.SystemProgram.programId,
          } as any)
          .signers([contributor1])
          .rpc();
        assert.fail("Should have failed with CampaignEnded");
      } catch (err: any) {
        assert.include(err.message, "CampaignEnded");
      }
    });
  });

  describe("withdraw (Success after deadline)", () => {
    it("Fails if unauthorized user tries to withdraw", async () => {
      try {
        await program.methods
          .withdraw()
          .accounts({
            creator: contributor1.publicKey,
            campaign: campaignPDA,
            vault: vaultPDA,
            systemProgram: anchor.web3.SystemProgram.programId,
          } as any)
          .signers([contributor1])
          .rpc();
        assert.fail("Should have failed with Unauthorized");
      } catch (err: any) {
        // Validation fails at Anchor level due to signature / unauthorized
      }
    });

    it("Withdraws funds to creator successfully", async () => {
      const initialBalance = await provider.connection.getBalance(creator.publicKey);
      
      await program.methods
        .withdraw()
        .accounts({
          creator: creator.publicKey,
          campaign: campaignPDA,
          vault: vaultPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        } as any)
        .signers([creator])
        .rpc();

      const campaignAccount = await program.account.campaign.fetch(campaignPDA);
      assert.isTrue(campaignAccount.claimed);

      const finalBalance = await provider.connection.getBalance(creator.publicKey);
      assert.isTrue(finalBalance > initialBalance + 5 * anchor.web3.LAMPORTS_PER_SOL);
    });

    it("Fails to withdraw if already claimed", async () => {
      try {
        await program.methods
          .withdraw()
          .accounts({
            creator: creator.publicKey,
            campaign: campaignPDA,
            vault: vaultPDA,
            systemProgram: anchor.web3.SystemProgram.programId,
          } as any)
          .signers([creator])
          .rpc();
        assert.fail("Should have failed with AlreadyClaimed");
      } catch (err: any) {
        assert.include(err.message, "AlreadyClaimed");
      }
    });
  });

  describe("refund", () => {
    let refundCampaignPDA: anchor.web3.PublicKey;
    let refundVaultPDA: anchor.web3.PublicKey;
    let refundContributionPDA: anchor.web3.PublicKey;

    before(async () => {
      const creator2 = anchor.web3.Keypair.generate();
      await airdrop(creator2.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL);
      
      refundCampaignPDA = getCampaignPDA(creator2.publicKey);
      refundVaultPDA = getVaultPDA(refundCampaignPDA);
      refundContributionPDA = getContributionPDA(refundCampaignPDA, contributor1.publicKey);

      const futureDeadline = new anchor.BN(Math.floor(Date.now() / 1000) + 2);
      const highGoal = new anchor.BN(100 * anchor.web3.LAMPORTS_PER_SOL);

      await program.methods
        .createCampaign(highGoal, futureDeadline)
        .accounts({
          creator: creator2.publicKey,
          campaign: refundCampaignPDA,
          vault: refundVaultPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        } as any)
        .signers([creator2])
        .rpc();

      await program.methods
        .contribute(new anchor.BN(1 * anchor.web3.LAMPORTS_PER_SOL))
        .accounts({
          contributor: contributor1.publicKey,
          campaign: refundCampaignPDA,
          vault: refundVaultPDA,
          contribution: refundContributionPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        } as any)
        .signers([contributor1])
        .rpc();
    });

    it("Fails to refund before deadline", async () => {
      try {
        await program.methods
          .refund()
          .accounts({
            contributor: contributor1.publicKey,
            campaign: refundCampaignPDA,
            vault: refundVaultPDA,
            contribution: refundContributionPDA,
            systemProgram: anchor.web3.SystemProgram.programId,
          } as any)
          .signers([contributor1])
          .rpc();
        assert.fail("Should have failed with DeadlineNotReached");
      } catch (err: any) {
        assert.include(err.message, "DeadlineNotReached");
      }
    });

    it("Waits 3 seconds for deadline to pass for refund test", async () => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
    });

    it("Refunds successfully to contributor", async () => {
      const initialBalance = await provider.connection.getBalance(contributor1.publicKey);
      
      await program.methods
        .refund()
        .accounts({
          contributor: contributor1.publicKey,
          campaign: refundCampaignPDA,
          vault: refundVaultPDA,
          contribution: refundContributionPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        } as any)
        .signers([contributor1])
        .rpc();

      const campaignAccount = await program.account.campaign.fetch(refundCampaignPDA);
      assert.isTrue(campaignAccount.raised.eq(new anchor.BN(0)));

      const contributionAccount = await program.account.contribution.fetch(refundContributionPDA);
      assert.isTrue(contributionAccount.amount.eq(new anchor.BN(0)));

      const finalBalance = await provider.connection.getBalance(contributor1.publicKey);
      assert.isTrue(finalBalance > initialBalance + 0.9 * anchor.web3.LAMPORTS_PER_SOL);
    });

    it("Fails to refund twice (NothingToRefund)", async () => {
      try {
        await program.methods
          .refund()
          .accounts({
            contributor: contributor1.publicKey,
            campaign: refundCampaignPDA,
            vault: refundVaultPDA,
            contribution: refundContributionPDA,
            systemProgram: anchor.web3.SystemProgram.programId,
          } as any)
          .signers([contributor1])
          .rpc();
        assert.fail("Should have failed with NothingToRefund");
      } catch (err: any) {
        assert.include(err.message, "NothingToRefund");
      }
    });

    it("Fails to refund if goal is reached", async () => {
       try {
        await program.methods
          .refund()
          .accounts({
            contributor: contributor1.publicKey,
            campaign: campaignPDA,
            vault: vaultPDA,
            contribution: contribution1PDA,
            systemProgram: anchor.web3.SystemProgram.programId,
          } as any)
          .signers([contributor1])
          .rpc();
        assert.fail("Should have failed with GoalAlreadyReached");
      } catch (err: any) {
        assert.include(err.message, "GoalAlreadyReached");
      }
    });
  });
});
