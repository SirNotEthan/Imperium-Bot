import { 
  ChatInputCommandInteraction, 
  SlashCommandBuilder, 
  EmbedBuilder,
  PermissionFlagsBits,
  TextChannel,
  GuildMember,
  User 
} from 'discord.js';
import { User as UserModel, ModerationLog } from '../../database/models';

const data = new SlashCommandBuilder()
  .setName('mute')
  .setDescription('Mute a user')
  .addUserOption(option =>
    option.setName('user')
      .setDescription('The user to mute')
      .setRequired(true)
  )
  .addStringOption(option =>
    option.setName('reason')
      .setDescription('Reason for the mute')
      .setRequired(true)
  )
  .addStringOption(option =>
    option.setName('duration')
      .setDescription('Mute duration (e.g., 1h, 1d, 1w for temporary, leave empty for permanent)')
      .setRequired(false)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true);
    const durationStr = interaction.options.getString('duration');

    
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
      const embed = new EmbedBuilder()
        .setTitle('❌ Insufficient Permissions')
        .setDescription('You need the "Moderate Members" permission to use this command.')
        .setColor(0xff3030)
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    
    let duration: number | undefined;
    let expiresAt: number | undefined;
    
    if (durationStr) {
      const parsedDuration = parseDuration(durationStr);
      if (parsedDuration === null) {
        const embed = new EmbedBuilder()
          .setTitle('❌ Invalid Duration')
          .setDescription('Please use format like: `1h`, `1d`, `1w` (hours, days, weeks)')
          .setColor(0xff3030)
          .setTimestamp();
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }
      duration = parsedDuration;
      expiresAt = Date.now() + duration;
    }

    
    const existingMute = await ModerationLog.findOne({
      where: {
        discordUserId: targetUser.id,
        guildId: interaction.guild?.id || '',
        action: ['mute', 'timeout'],
        isActive: true
      },
      order: [['createdAt', 'DESC']]
    });
    
    if (existingMute && (!existingMute.expiresAt || existingMute.expiresAt > new Date())) {
      const embed = new EmbedBuilder()
        .setTitle('❌ User Already Muted')
        .setDescription(`<@${targetUser.id}> is already muted.\n**Reason:** ${existingMute.reason}`)
        .setColor(0xff3030)
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    
    let userData = await UserModel.findOne({ where: { discordId: targetUser.id } });
    if (!userData) {
      userData = await UserModel.create({
        discordId: targetUser.id,
        messageCount: 0,
        level: 0
      });
    }

    
    const actionType = duration && duration <= 28 * 24 * 60 * 60 * 1000 ? 'timeout' : 'mute';

    
    const moderationAction = await ModerationLog.create({
      discordUserId: targetUser.id,
      guildId: interaction.guild?.id || '',
      moderatorId: interaction.user.id,
      action: actionType,
      reason,
      duration,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      isActive: true
    });

    
    let discordTimeoutSuccess = false;
    if (interaction.guild && duration && duration <= 28 * 24 * 60 * 60 * 1000) {
      try {
        const member = await interaction.guild.members.fetch(targetUser.id);
        if (member) {
          await member.timeout(duration, `${reason} | Moderator: ${interaction.user.tag}`);
          discordTimeoutSuccess = true;
        }
      } catch (error) {
        console.error('Failed to timeout user on Discord:', error);
      }
    }

    
    const embed = new EmbedBuilder()
      .setTitle(`🔇 User ${actionType === 'timeout' ? 'Timed Out' : 'Muted'}`)
      .setDescription(`<@${targetUser.id}> has been ${actionType === 'timeout' ? 'timed out' : 'muted'}`)
      .addFields(
        { name: '👤 User', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
        { name: '👮 Moderator', value: `<@${interaction.user.id}>`, inline: true },
        { name: '📝 Reason', value: reason, inline: false }
      )
      .setColor(0xff3030)
      .setThumbnail(targetUser.displayAvatarURL())
      .setTimestamp()
      .setFooter({ text: `Case ID: ${moderationAction.id}` });

    if (duration) {
      const durationText = formatDuration(duration);
      embed.addFields({ 
        name: '⏰ Duration', 
        value: `${durationText}\nExpires: <t:${Math.floor(expiresAt! / 1000)}:F>`, 
        inline: false 
      });

      if (!discordTimeoutSuccess) {
        embed.addFields({ 
          name: '⚠️ Note', 
          value: 'Discord timeout not applied (duration > 28 days or user not found). Mute is tracked internally.', 
          inline: false 
        });
      }
    } else {
      embed.addFields({ name: '⏰ Duration', value: 'Permanent', inline: false });
      embed.addFields({ 
        name: '⚠️ Note', 
        value: 'Permanent mute is tracked internally. Consider using Discord roles for channel restrictions.', 
        inline: false 
      });
    }

    
    await sendDMNotification(targetUser, actionType, reason, duration, interaction.user.tag);

    
    await interaction.reply({ embeds: [embed] });

    
    await logModerationAction(interaction, embed);

  } catch (error) {
    console.error('Error in mute command:', error);
    const embed = new EmbedBuilder()
      .setTitle('❌ Error')
      .setDescription('An error occurred while processing the mute.')
      .setColor(0xff3030)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

function parseDuration(durationStr: string): number | null {
  const match = durationStr.match(/^(\d+)([hddwmy])$/i);
  if (!match) return null;

  const amount = parseInt(match[1]);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 'h': return amount * 60 * 60 * 1000; 
    case 'd': return amount * 24 * 60 * 60 * 1000; 
    case 'w': return amount * 7 * 24 * 60 * 60 * 1000; 
    case 'm': return amount * 30 * 24 * 60 * 60 * 1000; 
    case 'y': return amount * 365 * 24 * 60 * 60 * 1000; 
    default: return null;
  }
}

function formatDuration(duration: number): string {
  const hours = Math.floor(duration / (60 * 60 * 1000));
  const days = Math.floor(hours / 24);
  
  if (days >= 365) {
    const years = Math.floor(days / 365);
    return `${years} year${years > 1 ? 's' : ''}`;
  } else if (days >= 30) {
    const months = Math.floor(days / 30);
    return `${months} month${months > 1 ? 's' : ''}`;
  } else if (days >= 7) {
    const weeks = Math.floor(days / 7);
    return `${weeks} week${weeks > 1 ? 's' : ''}`;
  } else if (days >= 1) {
    return `${days} day${days > 1 ? 's' : ''}`;
  } else {
    return `${hours} hour${hours > 1 ? 's' : ''}`;
  }
}

async function sendDMNotification(user: User, action: string, reason: string, duration?: number, moderatorTag?: string): Promise<void> {
  try {
    const actionTitle = action === 'timeout' ? 'You have been timed out' : 'You have been muted';
    const actionEmoji = action === 'timeout' ? '⏱️' : '🔇';
    
    const embed = new EmbedBuilder()
      .setTitle(`${actionEmoji} ${actionTitle}`)
      .setDescription('You have received a moderation action on the server.')
      .addFields(
        { name: '📝 Reason', value: reason, inline: false },
        { name: '👮 Moderator', value: moderatorTag || 'Unknown', inline: true }
      )
      .setColor(0xff3030)
      .setTimestamp();

    if (duration) {
      const durationText = formatDuration(duration);
      embed.addFields({ 
        name: '⏰ Duration', 
        value: `${durationText}\nExpires: <t:${Math.floor((Date.now() + duration) / 1000)}:F>`, 
        inline: false 
      });
    } else {
      embed.addFields({ name: '⏰ Duration', value: 'Permanent', inline: false });
    }

    embed.addFields({ 
      name: '📞 Appeal', 
      value: 'If you believe this action was taken in error, please contact the server administrators.', 
      inline: false 
    });

    await user.send({ embeds: [embed] });
  } catch (error) {
    console.error('Failed to send DM notification:', error);
  }
}

async function logModerationAction(interaction: ChatInputCommandInteraction, embed: EmbedBuilder): Promise<void> {
  try {
    
    if (!interaction.guild) return;
    
    const logChannels = interaction.guild.channels.cache.filter(channel => 
      channel.isTextBased() && 
      (channel.name.includes('mod-log') || 
       channel.name.includes('moderation-log') || 
       channel.name.includes('audit-log'))
    );

    if (logChannels.size > 0) {
      const logChannel = logChannels.first() as TextChannel;
      await logChannel.send({ embeds: [embed] });
    }
  } catch (error) {
    console.error('Failed to log moderation action:', error);
  }
}

export default { data, execute };