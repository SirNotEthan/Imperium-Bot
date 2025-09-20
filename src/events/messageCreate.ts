import { Message, GuildMember } from 'discord.js';
import { levelsStorage } from '../utils/levelsStorage';

export const name = 'messageCreate';
export const once = false;

export async function execute(message: Message): Promise<void> {
  try {
    if (message.author.bot || !message.guild) {
      return;
    }

    const result = levelsStorage.addMessage(message.author.id, message.content);

    if (result.leveledUp && result.newLevel !== undefined) {
      await handleLevelUp(message, result.newLevel, result.oldLevel!);
    }

  } catch (error) {
    console.error('Error in messageCreate event:', error);
  }
}

async function handleLevelUp(message: Message, newLevel: number, oldLevel: number): Promise<void> {
  try {
    const member = message.member as GuildMember;
    const levelRole = levelsStorage.getLevelRole(newLevel);

    let congratsMessage = `🎉 Congratulations ${member}! You've reached **Level ${newLevel}**!`;

    if (levelRole && message.guild) {
      const role = message.guild.roles.cache.get(levelRole);
      if (role) {
        try {
          await member.roles.add(role, `Level ${newLevel} reward`);
          congratsMessage += `\n🎭 You've been awarded the **${role.name}** role!`;
        } catch (error) {
          console.error(`Failed to add level role ${role.name} to ${member.user.tag}:`, error);
        }
      }
    }

    if (newLevel === 100) {
      congratsMessage += '\n👑 **Maximum Level Achieved!** You\'re a server legend!';
    } else if (newLevel === 50) {
      congratsMessage += '\n⭐ **Halfway to the top!** Keep up the amazing participation!';
    } else if (newLevel === 25) {
      congratsMessage += '\n🌟 **Quarter Century!** You\'re becoming a server veteran!';
    } else if (newLevel === 10) {
      congratsMessage += '\n🎯 **Double digits!** You\'re really getting active!';
    }

    if (message.channel.isSendable()) {
      await message.channel.send(congratsMessage);
    }

    console.log(`${member.user.tag} leveled up from ${oldLevel} to ${newLevel}`);

  } catch (error) {
    console.error(`Error handling level up for ${message.author.tag}:`, error);
  }
}