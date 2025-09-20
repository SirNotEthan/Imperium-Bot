import { Guild, GuildMember, PermissionFlagsBits } from 'discord.js';
import { verificationStorage } from './verificationStorage';

export class NicknameManager {
  static async updateMemberNickname(guild: Guild, memberId: string): Promise<boolean> {
    try {
      
      const verifiedUser = await verificationStorage.getVerifiedUser(memberId);
      if (!verifiedUser) {
        return false;
      }

      
      const member = await guild.members.fetch(memberId);
      if (!member) {
        return false;
      }

      
      const botMember = guild.members.me;
      if (!botMember?.permissions.has(PermissionFlagsBits.ManageNicknames)) {
        console.log('Bot lacks MANAGE_NICKNAMES permission');
        return false;
      }

      
      if (!member.manageable) {
        console.log(`Cannot manage member ${member.user.tag} - they have higher permissions`);
        return false;
      }

      
      await member.setNickname(verifiedUser.robloxUsername, 'Roblox verification sync');
      console.log(`Updated nickname for ${member.user.tag} to ${verifiedUser.robloxUsername}`);
      return true;

    } catch (error) {
      console.error('Error updating member nickname:', error);
      return false;
    }
  }

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

        
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log(`Nickname update complete: ${updated} updated, ${failed} failed`);
      return { updated, failed };

    } catch (error) {
      console.error('Error in bulk nickname update:', error);
      return { updated: 0, failed: 0 };
    }
  }

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

  static canManageNicknames(guild: Guild): boolean {
    const botMember = guild.members.me;
    return botMember?.permissions.has(PermissionFlagsBits.ManageNicknames) ?? false;
  }
}