import { 
  ChatInputCommandInteraction, 
  SlashCommandBuilder, 
  EmbedBuilder,
  User
} from 'discord.js';
import { levelsStorage } from '../../utils/levelsStorage';

const data = new SlashCommandBuilder()
  .setName('levels')
  .setDescription('Check your current server message level')
  .addUserOption(option =>
    option
      .setName('user')
      .setDescription('Check another user\'s level (optional)')
      .setRequired(false)
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const isOwnLevel = targetUser.id === interaction.user.id;

    const progress = levelsStorage.getLevelProgress(targetUser.id);
    const embed = createLevelEmbed(targetUser, progress, isOwnLevel);

    await interaction.reply({ embeds: [embed], ephemeral: true });

  } catch (error) {
    console.error('Error in levels command:', error);
    
    try {
      const errorMessage = { 
        content: 'An error occurred while checking levels. Please try again later.',
        ephemeral: true 
      };
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    } catch (followUpError) {
      console.error('Failed to send error response:', followUpError);
    }
  }
}

function createLevelEmbed(user: User, progress: any, isOwnLevel: boolean): EmbedBuilder {
  const {
    currentLevel,
    messageCount,
    messagesForNextLevel,
    progressToNext,
    totalMessagesForNext
  } = progress;

  const embed = new EmbedBuilder()
    .setTitle(`📊 ${isOwnLevel ? 'Your' : `${user.displayName}'s`} Level`)
    .setThumbnail(user.displayAvatarURL())
    .setColor(getLevelColor(currentLevel))
    .addFields(
      {
        name: '📈 Current Level',
        value: `**Level ${currentLevel}**`,
        inline: true
      },
      {
        name: '💬 Total Messages',
        value: `**${messageCount.toLocaleString()}**`,
        inline: true
      },
      {
        name: '🎯 Progress to Next',
        value: currentLevel >= 100 
          ? '**MAX LEVEL REACHED!**' 
          : `**${progressToNext}/${messagesForNextLevel}**`,
        inline: true
      }
    )
    .setTimestamp();

  if (currentLevel < 100) {
    const progressPercentage = Math.round((progressToNext / messagesForNextLevel) * 100);
    const progressBar = createProgressBar(progressToNext, messagesForNextLevel);
    
    embed.addFields({
      name: `🔥 Progress to Level ${currentLevel + 1}`,
      value: `${progressBar}\n**${progressPercentage}%** complete (${messagesForNextLevel - progressToNext} messages to go)`,
      inline: false
    });
  }

  if (currentLevel === 100) {
    embed.addFields({
      name: '👑 Achievement Unlocked!',
      value: 'You\'ve reached the maximum level! You\'re a true server legend!',
      inline: false
    });
  } else if (currentLevel >= 50) {
    embed.addFields({
      name: '⭐ High Level User',
      value: 'You\'re among the most active members of this server!',
      inline: false
    });
  } else if (currentLevel >= 25) {
    embed.addFields({
      name: '🌟 Active Member',
      value: 'Keep up the great participation!',
      inline: false
    });
  }

  embed.setFooter({ 
    text: 'Levels increase based on server activity • Messages must be 3+ characters' 
  });

  return embed;
}

function createProgressBar(current: number, total: number, length: number = 20): string {
  const percentage = Math.min(current / total, 1);
  const filled = Math.round(percentage * length);
  const empty = length - filled;
  
  const filledBar = '█'.repeat(filled);
  const emptyBar = '▒'.repeat(empty);
  
  return `\`${filledBar}${emptyBar}\``;
}

function getLevelColor(level: number): number {
  if (level >= 100) return 0xFFD700; 
  if (level >= 75) return 0xFF6B6B;  
  if (level >= 50) return 0xFF9500;  
  if (level >= 25) return 0x4ECDC4;  
  if (level >= 10) return 0x45B7D1;  
  return 0x96CEB4; 
}

export default { data, execute };