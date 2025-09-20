import { 
  ChatInputCommandInteraction, 
  SlashCommandBuilder, 
  EmbedBuilder,
  PermissionFlagsBits
} from 'discord.js';
import { Op } from 'sequelize';
import { ModerationLog } from '../../database/models';
import sequelize from '../../database/database';

const data = new SlashCommandBuilder()
  .setName('modstats')
  .setDescription('View moderation statistics for this server')
  .addStringOption(option =>
    option.setName('timeframe')
      .setDescription('Time period to analyze')
      .addChoices(
        { name: 'Last 24 hours', value: '1d' },
        { name: 'Last 7 days', value: '7d' },
        { name: 'Last 30 days', value: '30d' },
        { name: 'Last 90 days', value: '90d' },
        { name: 'All time', value: 'all' }
      )
      .setRequired(false)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const timeframe = interaction.options.getString('timeframe') || '30d';

    
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      const embed = new EmbedBuilder()
        .setTitle('❌ Insufficient Permissions')
        .setDescription('You need the "Manage Server" permission to use this command.')
        .setColor(0xff3030)
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    if (!interaction.guild) {
      const embed = new EmbedBuilder()
        .setTitle('❌ Server Only')
        .setDescription('This command can only be used in a server.')
        .setColor(0xff3030)
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    
    let dateFilter = {};
    let timeframeText = 'All time';
    
    if (timeframe !== 'all') {
      const days = parseInt(timeframe.replace('d', ''));
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      dateFilter = {
        createdAt: {
          [Op.gte]: cutoffDate
        }
      };
      
      timeframeText = timeframe === '1d' ? 'Last 24 hours' : 
                     timeframe === '7d' ? 'Last 7 days' :
                     timeframe === '30d' ? 'Last 30 days' :
                     timeframe === '90d' ? 'Last 90 days' : 'All time';
    }

    
    const totalActions = await ModerationLog.count({
      where: {
        guildId: interaction.guild.id,
        ...dateFilter
      }
    });

    if (totalActions === 0) {
      const embed = new EmbedBuilder()
        .setTitle('📊 Moderation Statistics')
        .setDescription(`No moderation actions found for **${timeframeText.toLowerCase()}**.`)
        .setColor(0x4CAF50)
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed] });
      return;
    }

    
    const actionCounts = await ModerationLog.findAll({
      where: {
        guildId: interaction.guild.id,
        ...dateFilter
      },
      attributes: [
        'action',
        [sequelize.fn('COUNT', sequelize.col('action')), 'count']
      ],
      group: ['action'],
      order: [[sequelize.literal('count'), 'DESC']],
      raw: true
    }) as any[];

    
    const topModerators = await ModerationLog.findAll({
      where: {
        guildId: interaction.guild.id,
        ...dateFilter
      },
      attributes: [
        'moderatorId',
        [sequelize.fn('COUNT', sequelize.col('moderatorId')), 'count']
      ],
      group: ['moderatorId'],
      order: [[sequelize.literal('count'), 'DESC']],
      limit: 5,
      raw: true
    }) as any[];

    
    const recentActivity = await ModerationLog.findAll({
      where: {
        guildId: interaction.guild.id,
        ...dateFilter
      },
      order: [['createdAt', 'DESC']],
      limit: 5
    });

    
    const embed = new EmbedBuilder()
      .setTitle('📊 Moderation Statistics')
      .setDescription(`Statistics for **${interaction.guild.name}**`)
      .setColor(0x3498DB)
      .setThumbnail(interaction.guild.iconURL())
      .setTimestamp();

    
    embed.addFields({
      name: '📅 Timeframe',
      value: `${timeframeText} • **${totalActions}** total actions`,
      inline: false
    });

    
    const actionBreakdown = actionCounts.map(stat => {
      const percentage = ((stat.count / totalActions) * 100).toFixed(1);
      return `${getActionEmoji(stat.action)} **${stat.action.toUpperCase()}**: ${stat.count} (${percentage}%)`;
    }).join('\n');

    embed.addFields({
      name: '📋 Action Breakdown',
      value: actionBreakdown,
      inline: false
    });

    
    if (topModerators.length > 0) {
      const moderatorText = topModerators.map((mod, index) => {
        const percentage = ((mod.count / totalActions) * 100).toFixed(1);
        return `${index + 1}. <@${mod.moderatorId}>: ${mod.count} (${percentage}%)`;
      }).join('\n');

      embed.addFields({
        name: '👮 Most Active Moderators',
        value: moderatorText,
        inline: false
      });
    }

    
    if (recentActivity.length > 0) {
      const recentText = recentActivity.map(entry => {
        const timestamp = `<t:${Math.floor(entry.createdAt.getTime() / 1000)}:R>`;
        const actionEmoji = getActionEmoji(entry.action);
        return `${actionEmoji} **${entry.action.toUpperCase()}** <@${entry.discordUserId}> ${timestamp}`;
      }).join('\n');

      embed.addFields({
        name: '🕐 Recent Activity',
        value: recentText,
        inline: false
      });
    }

    
    const activeBans = await ModerationLog.count({
      where: {
        guildId: interaction.guild.id,
        action: 'ban',
        isActive: true
      }
    });

    const activeMutes = await ModerationLog.count({
      where: {
        guildId: interaction.guild.id,
        action: ['mute', 'timeout'],
        isActive: true
      }
    });

    if (activeBans > 0 || activeMutes > 0) {
      let activeText = [];
      if (activeBans > 0) activeText.push(`🔨 **${activeBans}** active bans`);
      if (activeMutes > 0) activeText.push(`🔇 **${activeMutes}** active mutes/timeouts`);
      
      embed.addFields({
        name: '⚡ Currently Active',
        value: activeText.join(' • '),
        inline: false
      });
    }

    await interaction.reply({ embeds: [embed] });

  } catch (error) {
    console.error('Error in modstats command:', error);
    const embed = new EmbedBuilder()
      .setTitle('❌ Error')
      .setDescription('An error occurred while retrieving moderation statistics.')
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

export default { data, execute };