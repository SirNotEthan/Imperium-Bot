import { Guild, GuildMember, PermissionFlagsBits } from 'discord.js';
import { verificationStorage } from './verificationStorage';

export class NicknameManager {
  /**
   * Updates a Discord member's nickname to their Roblox username if they're verified
   */
  static async updateMemberNickname(guild: Guild, memberId: string): Promise<boolean> {
    try {
      // Check if user is verified
      const verifiedUser = await verificationStorage.getVerifiedUser(memberId);
      if (!verifiedUser) {
        return false;
      }

      // Fetch the member
      const member = await guild.members.fetch(memberId);
      if (!member) {
        return false;
      }

      // Check bot permissions
      const botMember = guild.members.me;
      if (!botMember?.permissions.has(PermissionFlagsBits.ManageNicknames)) {
        console.log('Bot lacks MANAGE_NICKNAMES permission');
        return false;
      }

      // Check if we can modify this member (they're not higher than bot)
      if (!member.manageable) {
        console.log(`Cannot manage member ${member.user.tag} - they have higher permissions`);
        return false;
      }

      // Update nickname
      await member.setNickname(verifiedUser.robloxUsername, 'Roblox verification sync');
      console.log(`Updated nickname for ${member.user.tag} to ${verifiedUser.robloxUsername}`);
      return true;

    } catch (error) {
      console.error('Error updating member nickname:', error);
      return false;
    }
  }

  /**
   * Updates nicknames for all verified users in a guild
   */
  static async updateAllNicknames(guild: Guild): Promise<{ updated: number; failed: number }> {
    try {
      const verifiedUsers = await verificationStorage.getAllVerifiedUsers();
      let updated = 0;
      let failed = 0;

      console.log(`Starting nickname update for ${verifiedUsers.length} verified users`);

      for (const verifiedUser of verifiedUsers) {
        const success = await this.updateMemberNickname(guild, verifiedUser.discordId);
        if (success) {
          updated++;
        } else {
          failed++;
        }

        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log(`Nickname update complete: ${updated} updated, ${failed} failed`);
      return { updated, failed };

    } catch (error) {
      console.error('Error in bulk nickname update:', error);
      return { updated: 0, failed: 0 };
    }
  }

  /**
   * Resets a member's nickname (removes it)
   */
  static async resetMemberNickname(guild: Guild, memberId: string): Promise<boolean> {
    try {
      const member = await guild.members.fetch(memberId);
      if (!member) return false;

      const botMember = guild.members.me;
      if (!botMember?.permissions.has(PermissionFlagsBits.ManageNicknames)) {
        return false;
      }

      if (!member.manageable) {
        return false;
      }

      await member.setNickname(null, 'Roblox verification removed');
      return true;

    } catch (error) {
      console.error('Error resetting member nickname:', error);
      return false;
    }
  }

  /**
   * Checks if the bot can manage nicknames in a guild
   */
  static canManageNicknames(guild: Guild): boolean {
    const botMember = guild.members.me;
    return botMember?.permissions.has(PermissionFlagsBits.ManageNicknames) ?? false;
  }
}