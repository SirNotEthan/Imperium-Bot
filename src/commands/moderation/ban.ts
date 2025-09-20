import { 
  ChatInputCommandInteraction, 
  SlashCommandBuilder, 
  EmbedBuilder,
  PermissionFlagsBits,
  User,
  TextChannel 
} from 'discord.js';
import { User as UserModel, ModerationLog } from '../../database/models';

const data = new SlashCommandBuilder()
  .setName('ban')
  .setDescription('Ban a user from the server')
  .addUserOption(option =>
    option.setName('user')
      .setDescription('The user to ban')
      .setRequired(true)
  )
  .addStringOption(option =>
    option.setName('reason')
      .setDescription('Reason for the ban')
      .setRequired(true)
  )
  .addStringOption(option =>
    option.setName('duration')
      .setDescription('Ban duration (e.g., 1d, 1w, 1m for temporary, leave empty for permanent)')
      .setRequired(false)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers);

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true);
    const durationStr = interaction.options.getString('duration');

    
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.BanMembers)) {
      const embed = new EmbedBuilder()
        .setTitle('❌ Insufficient Permissions')
        .setDescription('You need the "Ban Members" permission to use this command.')
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
          .setDescription('Please use format like: `1d`, `1w`, `1m` (days, weeks, months)')
          .setColor(0xff3030)
          .setTimestamp();
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }
      duration = parsedDuration;
      expiresAt = Date.now() + duration;
    }

    
    const existingBan = await ModerationLog.findOne({
      where: {
        discordUserId: targetUser.id,
        guildId: interaction.guild?.id || '',
        action: 'ban',
        isActive: true
      },
      order: [['createdAt', 'DESC']]
    });
    
    if (existingBan && (!existingBan.expiresAt || existingBan.expiresAt > new Date())) {
      const embed = new EmbedBuilder()
        .setTitle('❌ User Already Banned')
        .setDescription(`<@${targetUser.id}> is already banned.\n**Reason:** ${existingBan.reason}`)
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

    
    const moderationAction = await ModerationLog.create({
      discordUserId: targetUser.id,
      guildId: interaction.guild?.id || '',
      moderatorId: interaction.user.id,
      action: 'ban',
      reason,
      duration,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      isActive: true
    });

    
    let discordBanSuccess = false;
    if (interaction.guild) {
      try {
        await interaction.guild.members.ban(targetUser.id, {
          reason: `${reason} | Moderator: ${interaction.user.tag}`
        });
        discordBanSuccess = true;
      } catch (error) {
        console.error('Failed to ban user from Discord:', error);
      }
    }

    
    const embed = new EmbedBuilder()
      .setTitle('🔨 User Banned')
      .setDescription(`<@${targetUser.id}> has been banned`)
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
    } else {
      embed.addFields({ name: '⏰ Duration', value: 'Permanent', inline: false });
    }

    if (!discordBanSuccess && interaction.guild) {
      embed.addFields({ 
        name: '⚠️ Note', 
        value: 'Failed to ban from Discord server. User may have higher permissions.', 
        inline: false 
      });
    }

    
    await sendDMNotification(targetUser, 'ban', reason, duration, interaction.user.tag);

    
    await interaction.reply({ embeds: [embed] });

    
    await logModerationAction(interaction, embed);

  } catch (error) {
    console.error('Error in ban command:', error);
    const embed = new EmbedBuilder()
      .setTitle('❌ Error')
      .setDescription('An error occurred while processing the ban.')
      .setColor(0xff3030)
      .setTimestamp();

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [embed], ephemeral: true });
      } else {
        await interaction.reply({ embeds: [embed], ephemeral: true });
      }
    } catch (followUpError) {
      console.error('Failed to send error response:', followUpError);
    }
  }
}

function parseDuration(durationStr: string): number | null {
  const match = durationStr.match(/^(\d+)([dwmy])$/i);
  if (!match) return null;

  const amount = parseInt(match[1]);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 'd': return amount * 24 * 60 * 60 * 1000; 
    case 'w': return amount * 7 * 24 * 60 * 60 * 1000; 
    case 'm': return amount * 30 * 24 * 60 * 60 * 1000; 
    case 'y': return amount * 365 * 24 * 60 * 60 * 1000; 
    default: return null;
  }
}

function formatDuration(duration: number): string {
  const days = Math.floor(duration / (24 * 60 * 60 * 1000));
  
  if (days >= 365) {
    const years = Math.floor(days / 365);
    return `${years} year${years > 1 ? 's' : ''}`;
  } else if (days >= 30) {
    const months = Math.floor(days / 30);
    return `${months} month${months > 1 ? 's' : ''}`;
  } else if (days >= 7) {
    const weeks = Math.floor(days / 7);
    return `${weeks} week${weeks > 1 ? 's' : ''}`;
  } else {
    return `${days} day${days > 1 ? 's' : ''}`;
  }
}

async function sendDMNotification(user: User, action: string, reason: string, duration?: number, moderatorTag?: string): Promise<void> {
  try {
    const embed = new EmbedBuilder()
      .setTitle('🔨 You have been banned')
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