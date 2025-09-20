import { Events, GuildMember } from 'discord.js';
import { verificationStorage } from '../utils/verificationStorage';
import { NicknameManager } from '../utils/nicknameManager';

export const name = Events.GuildMemberAdd;
export const once = false;

export async function execute(member: GuildMember): Promise<void> {
  try {
    // Check if this user is already verified
    const verifiedUser = await verificationStorage.getVerifiedUser(member.id);
    
    if (verifiedUser) {
      console.log(`Verified user ${member.user.tag} joined ${member.guild.name}`);
      
      // Update their nickname to their Roblox username
      const nicknameUpdated = await NicknameManager.updateMemberNickname(member.guild, member.id);
      
      if (nicknameUpdated) {
        console.log(`Updated nickname for ${member.user.tag} to ${verifiedUser.robloxUsername}`);
      } else {
        console.log(`Could not update nickname for ${member.user.tag}`);
      }
    }
  } catch (error) {
    console.error('Error in guildMemberAdd event:', error);
  }
}