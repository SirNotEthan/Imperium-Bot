import { 
  ChatInputCommandInteraction, 
  SlashCommandBuilder, 
  EmbedBuilder,
  PermissionFlagsBits
} from 'discord.js';
import { User as UserModel, ModerationLog } from '../../database/models';
import sequelize from '../../database/database';

const data = new SlashCommandBuilder()
  .setName('history')
  .setDescription('View moderation history for a user')
  .addUserOption(option =>
    option.setName('user')
      .setDescription('The user to view history for')
      .setRequired(true)
  )
  .addIntegerOption(option =>
    option.setName('limit')
      .setDescription('Number of recent entries to show (default: 10)')
      .setMinValue(1)
      .setMaxValue(25)
      .setRequired(false)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const targetUser = interaction.options.getUser('user', true);
    const limit = interaction.options.getInteger('limit') || 10;

    // Check permissions
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
      const embed = new EmbedBuilder()
        .setTitle('❌ Insufficient Permissions')
        .setDescription('You need the "Moderate Members" permission to use this command.')
        .setColor(0xff3030)
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    // Get moderation history
    const moderationHistory = await ModerationLog.findAll({
      where: {
        discordUserId: targetUser.id,
        guildId: interaction.guild?.id || ''
      },
      order: [['createdAt', 'DESC']],
      limit: limit
    });

    if (moderationHistory.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('📋 No Moderation History')
        .setDescription(`<@${targetUser.id}> has no moderation history.`)
        .setColor(0x4CAF50)
        .setThumbnail(targetUser.displayAvatarURL())
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed] });
      return;
    }

    // Get active actions
    const activeBan = await ModerationLog.findOne({
      where: {
        discordUserId: targetUser.id,
        guildId: interaction.guild?.id || '',
        action: 'ban',
        isActive: true
      },
      order: [['createdAt', 'DESC']]
    });

    const activeMute = await ModerationLog.findOne({
      where: {
        discordUserId: targetUser.id,
        guildId: interaction.guild?.id || '',
        action: ['mute', 'timeout'],
        isActive: true
      },
      order: [['createdAt', 'DESC']]
    });

    // Create history embed
    const embed = new EmbedBuilder()
      .setTitle('📋 Moderation History')
      .setDescription(`Moderation history for <@${targetUser.id}>`)
      .setColor(0x3498DB)
      .setThumbnail(targetUser.displayAvatarURL())
      .setTimestamp();

    // Add active status
    let statusText = '✅ Clean';
    if (activeBan && (!activeBan.expiresAt || activeBan.expiresAt > new Date())) {
      statusText = '🔨 Banned';
      if (activeBan.expiresAt) {
        statusText += ` (expires <t:${Math.floor(activeBan.expiresAt.getTime() / 1000)}:R>)`;
      }
    } else if (activeMute && (!activeMute.expiresAt || activeMute.expiresAt > new Date())) {
      const actionType = activeMute.action === 'timeout' ? 'Timed Out' : 'Muted';
      statusText = `🔇 ${actionType}`;
      if (activeMute.expiresAt) {
        statusText += ` (expires <t:${Math.floor(activeMute.expiresAt.getTime() / 1000)}:R>)`;
      }
    }

    embed.addFields({
      name: '📊 Current Status',
      value: statusText,
      inline: false
    });

    // Add recent history
    const historyText = moderationHistory.map((entry, index) => {
      const timestamp = `<t:${Math.floor(entry.createdAt.getTime() / 1000)}:f>`;
      const actionEmoji = getActionEmoji(entry.action);
      const moderator = `<@${entry.moderatorId}>`;
      const duration = entry.duration ? ` (${formatDuration(entry.duration)})` : '';
      const status = entry.isActive ? '🟢' : '🔴';
      
      return `${index + 1}. ${actionEmoji} **${entry.action.toUpperCase()}**${duration} by ${moderator}\n` +
             `   ${timestamp} | ${status} ${entry.isActive ? 'Active' : 'Inactive'}\n` +
             `   *${entry.reason.length > 50 ? entry.reason.substring(0, 50) + '...' : entry.reason}*`;
    }).join('\n\n');

    embed.addFields({
      name: `📝 Recent History (${moderationHistory.length}/${limit})`,
      value: historyText.length > 1024 ? historyText.substring(0, 1021) + '...' : historyText,
      inline: false
    });

    // Add statistics
    const totalActions = await ModerationLog.count({
      where: { 
        discordUserId: targetUser.id,
        guildId: interaction.guild?.id || ''
      }
    });

    const actionCounts = await ModerationLog.findAll({
      where: { 
        discordUserId: targetUser.id,
        guildId: interaction.guild?.id || ''
      },
      attributes: [
        'action',
        [sequelize.fn('COUNT', sequelize.col('action')), 'count']
      ],
      group: ['action'],
      raw: true
    }) as any[];

    const statsText = actionCounts.map(stat => 
      `${getActionEmoji(stat.action)} ${stat.action}: ${stat.count}`
    ).join(' • ');

    if (statsText) {
      embed.addFields({
        name: `📊 Statistics (Total: ${totalActions})`,
        value: statsText,
        inline: false
      });
    }

    await interaction.reply({ embeds: [embed] });

  } catch (error) {
    console.error('Error in history command:', error);
    const embed = new EmbedBuilder()
      .setTitle('❌ Error')
      .setDescription('An error occurred while retrieving moderation history.')
      .setColor(0xff3030)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

function getActionEmoji(action: string): string {
  switch (action) {
    case 'ban': return '🔨';
    case 'unban': return '✅';
    case 'mute': return '🔇';
    case 'timeout': return '⏱️';
    case 'unmute': return '🔊';
    case 'kick': return '👢';
    default: return '⚠️';
  }
}

function formatDuration(duration: number): string {
  const hours = Math.floor(duration / (60 * 60 * 1000));
  const days = Math.floor(hours / 24);
  
  if (days >= 365) {
    const years = Math.floor(days / 365);
    return `${years}y`;
  } else if (days >= 30) {
    const months = Math.floor(days / 30);
    return `${months}mo`;
  } else if (days >= 7) {
    const weeks = Math.floor(days / 7);
    return `${weeks}w`;
  } else if (days >= 1) {
    return `${days}d`;
  } else {
    return `${hours}h`;
  }
}

export default { data, execute };