import { 
  ChatInputCommandInteraction, 
  SlashCommandBuilder, 
  EmbedBuilder,
  User,
  GuildMember
} from 'discord.js';
import { ModerationLog } from '../../database/models';
import RolePermissions from '../../utils/rolePermissions';
import { Op } from 'sequelize';

const data = new SlashCommandBuilder()
  .setName('cmdhistory')
  .setDescription('View command history for staff moderation actions')
  .addUserOption(option =>
    option.setName('moderator')
      .setDescription('Filter by specific moderator (optional)')
      .setRequired(false)
  )
  .addUserOption(option =>
    option.setName('target')
      .setDescription('Filter by specific target user (optional)')
      .setRequired(false)
  )
  .addStringOption(option =>
    option.setName('action')
      .setDescription('Filter by action type (optional)')
      .setRequired(false)
      .addChoices(
        { name: 'Ban', value: 'ban' },
        { name: 'Unban', value: 'unban' },
        { name: 'Mute', value: 'mute' },
        { name: 'Unmute', value: 'unmute' },
        { name: 'Kick', value: 'kick' },
        { name: 'Timeout', value: 'timeout' },
        { name: 'Untimeout', value: 'untimeout' },
        { name: 'Game Ban', value: 'gameban' },
        { name: 'Warning', value: 'warning' },
        { name: 'Community Ban', value: 'communityban' }
      )
  )
  .addIntegerOption(option =>
    option.setName('limit')
      .setDescription('Number of results to show (1-50, default: 20)')
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(50)
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const member = interaction.member as GuildMember;
    const memberRoleIds = member.roles.cache.map(role => role.id);
    
    const permissionCheck = RolePermissions.checkStaffPermission(memberRoleIds, interaction.guild?.id);
    if (!permissionCheck.hasPermission) {
      const embed = new EmbedBuilder()
        .setTitle('Insufficient Permissions')
        .setDescription(permissionCheck.message || 'You do not have permission to use this command.')
        .setColor(0xff3030)
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    await interaction.deferReply();

    const moderator = interaction.options.getUser('moderator');
    const target = interaction.options.getUser('target');
    const action = interaction.options.getString('action');
    const limit = interaction.options.getInteger('limit') || 20;

    // Build query conditions
    const whereClause: any = {
      guildId: interaction.guild?.id || ''
    };

    if (moderator) {
      whereClause.moderatorId = moderator.id;
    }

    if (target) {
      whereClause.discordUserId = target.id;
    }

    if (action) {
      whereClause.action = action;
    }

    // Get command history
    const commandHistory = await ModerationLog.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      limit: limit
    });

    if (commandHistory.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('Command History')
        .setDescription('No moderation commands found matching the specified criteria.')
        .setColor(0x00AFF4)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Create history embed
    const embed = new EmbedBuilder()
      .setTitle('Staff Command History')
      .setColor(0x00AFF4)
      .setTimestamp()
      .setFooter({ text: `Showing ${commandHistory.length} result${commandHistory.length !== 1 ? 's' : ''}` });

    // Add filter information
    const filters = [];
    if (moderator) filters.push(`**Moderator:** ${moderator.tag}`);
    if (target) filters.push(`**Target:** ${target.tag}`);
    if (action) filters.push(`**Action:** ${action}`);
    
    if (filters.length > 0) {
      embed.setDescription(`**Filters Applied:**\n${filters.join('\n')}\n\u200B`);
    }

    // Group commands by chunks for embed fields
    const commandChunks = [];
    for (let i = 0; i < commandHistory.length; i += 5) {
      commandChunks.push(commandHistory.slice(i, i + 5));
    }

    for (let chunkIndex = 0; chunkIndex < commandChunks.length; chunkIndex++) {
      const chunk = commandChunks[chunkIndex];
      const fieldValue = await Promise.all(chunk.map(async (log, index) => {
        let moderatorName = 'Unknown';
        let targetName = 'Unknown';

        try {
          const moderatorUser = await interaction.client.users.fetch(log.moderatorId).catch(() => null);
          const targetUser = await interaction.client.users.fetch(log.discordUserId).catch(() => null);
          
          moderatorName = moderatorUser ? moderatorUser.tag : `Unknown (${log.moderatorId})`;
          targetName = targetUser ? targetUser.tag : `Unknown (${log.discordUserId})`;
        } catch (error) {
          console.error('Error fetching user data for command history:', error);
        }

        const actionEmoji = getActionEmoji(log.action);
        const timestamp = `<t:${Math.floor(log.createdAt.getTime() / 1000)}:R>`;
        
        let durationText = '';
        if (log.duration && log.expiresAt && log.expiresAt > new Date()) {
          const duration = formatDuration(log.duration);
          durationText = ` (${duration})`;
        }

        return `${actionEmoji} **${log.action.toUpperCase()}** - Case #${log.id}\n` +
               `**${moderatorName}** →  **${targetName}**\n` +
               `${log.reason.length > 50 ? log.reason.substring(0, 50) + '...' : log.reason}${durationText}\n` +
               `${timestamp}\n`;
      }));

      const fieldName = chunkIndex === 0 ? 'Recent Commands' : '\u200B';
      embed.addFields({
        name: fieldName,
        value: fieldValue.join('\n'),
        inline: false
      });
    }

    // Add statistics
    const stats = await getCommandStats(whereClause);
    if (stats.length > 0) {
      const statsText = stats.map(stat => `**${stat.action}:** ${stat.count}`).join(' • ');
      embed.addFields({
        name: 'Action Statistics',
        value: statsText,
        inline: false
      });
    }

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('Error in cmdhistory command:', error);
    const embed = new EmbedBuilder()
      .setTitle('Error')
      .setDescription('An error occurred while fetching command history.')
      .setColor(0xff3030)
      .setTimestamp();

    if (interaction.deferred) {
      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
}

function getActionEmoji(action: string): string {
  return '';
}

function formatDuration(duration: number): string {
  const days = Math.floor(duration / (24 * 60 * 60 * 1000));
  const hours = Math.floor((duration % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((duration % (60 * 60 * 1000)) / (60 * 1000));

  if (days > 0) {
    return `${days}d${hours > 0 ? ` ${hours}h` : ''}`;
  } else if (hours > 0) {
    return `${hours}h${minutes > 0 ? ` ${minutes}m` : ''}`;
  } else {
    return `${minutes}m`;
  }
}

async function getCommandStats(whereClause: any): Promise<Array<{action: string, count: number}>> {
  try {
    const stats = await ModerationLog.findAll({
      where: whereClause,
      attributes: [
        'action',
        [ModerationLog.sequelize!.fn('COUNT', ModerationLog.sequelize!.col('action')), 'count']
      ],
      group: ['action'],
      order: [[ModerationLog.sequelize!.fn('COUNT', ModerationLog.sequelize!.col('action')), 'DESC']]
    });

    return stats.map((stat: any) => ({
      action: stat.action,
      count: parseInt(stat.dataValues.count)
    }));
  } catch (error) {
    console.error('Error fetching command stats:', error);
    return [];
  }
}

export default { data, execute };