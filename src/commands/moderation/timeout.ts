import { 
  ChatInputCommandInteraction, 
  SlashCommandBuilder, 
  EmbedBuilder,
  User,
  TextChannel,
  GuildMember
} from 'discord.js';
import { User as UserModel, ModerationLog } from '../../database/models';
import RolePermissions from '../../utils/rolePermissions';

const data = new SlashCommandBuilder()
  .setName('timeout')
  .setDescription('Timeout a user from the server')
  .addUserOption(option =>
    option.setName('username')
      .setDescription('The user to timeout')
      .setRequired(true)
  )
  .addStringOption(option =>
    option.setName('time')
      .setDescription('Timeout duration (e.g., 1m, 1h, 1d)')
      .setRequired(true)
  )
  .addStringOption(option =>
    option.setName('reason')
      .setDescription('Reason for the timeout')
      .setRequired(true)
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    
    await interaction.deferReply();
    
    const targetUser = interaction.options.getUser('username', true);
    const timeStr = interaction.options.getString('time', true);
    const reason = interaction.options.getString('reason', true);

    const member = interaction.member as GuildMember;
    const memberRoleIds = member.roles.cache.map(role => role.id);
    
    const permissionCheck = RolePermissions.checkStaffPermission(memberRoleIds, interaction.guild?.id);
    if (!permissionCheck.hasPermission) {
      const embed = new EmbedBuilder()
        .setTitle('❌ Insufficient Permissions')
        .setDescription(permissionCheck.message || 'You do not have permission to use this command.')
        .setColor(0xff3030)
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const duration = parseDuration(timeStr);
    if (duration === null) {
      const embed = new EmbedBuilder()
        .setTitle('❌ Invalid Duration')
        .setDescription('Please use format like: `1m`, `1h`, `1d` (minutes, hours, days)')
        .setColor(0xff3030)
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (duration > 28 * 24 * 60 * 60 * 1000) {
      const embed = new EmbedBuilder()
        .setTitle('❌ Duration Too Long')
        .setDescription('Timeout duration cannot exceed 28 days.')
        .setColor(0xff3030)
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const expiresAt = Date.now() + duration;

    
    const existingTimeout = await ModerationLog.findOne({
      where: {
        discordUserId: targetUser.id,
        guildId: interaction.guild?.id || '',
        action: 'timeout',
        isActive: true
      },
      order: [['createdAt', 'DESC']]
    });
    
    if (existingTimeout && existingTimeout.expiresAt && existingTimeout.expiresAt > new Date()) {
      const embed = new EmbedBuilder()
        .setTitle('❌ User Already Timed Out')
        .setDescription(`<@${targetUser.id}> is already timed out.\n**Reason:** ${existingTimeout.reason}\n**Expires:** <t:${Math.floor(existingTimeout.expiresAt.getTime() / 1000)}:F>`)
        .setColor(0xff3030)
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed] });
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
      action: 'timeout',
      reason,
      duration,
      expiresAt: new Date(expiresAt),
      isActive: true
    });

    
    let discordTimeoutSuccess = false;
    if (interaction.guild) {
      try {
        const targetMember = await interaction.guild.members.fetch(targetUser.id);
        
        
        const botMember = interaction.guild.members.me;
        if (!botMember?.permissions.has('ModerateMembers')) {
          throw new Error('Bot missing MODERATE_MEMBERS permission');
        }
        
        
        if (!targetMember.moderatable) {
          throw new Error('Cannot timeout this user - they may have higher permissions');
        }
        
        await targetMember.timeout(duration, `${reason} | Moderator: ${interaction.user.tag}`);
        discordTimeoutSuccess = true;
      } catch (error) {
        console.error('Failed to timeout user in Discord:', error);
        
        
        if (error instanceof Error && (error.message.includes('permission') || error.message.includes('50013'))) {
          const embed = new EmbedBuilder()
            .setTitle('❌ Permission Error')
            .setDescription('Bot lacks permission to timeout users. Please ensure the bot has the **Moderate Members** permission and a role higher than the target user.')
            .setColor(0xff3030)
            .setTimestamp();
          
          await interaction.editReply({ embeds: [embed] });
          return;
        }
      }
    }

    
    const embed = new EmbedBuilder()
      .setTitle('⏰ User Timed Out')
      .setDescription(`<@${targetUser.id}> has been timed out`)
      .addFields(
        { name: '👤 User', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
        { name: '👮 Moderator', value: `<@${interaction.user.id}>`, inline: true },
        { name: '📝 Reason', value: reason, inline: false },
        { name: '⏰ Duration', value: `${formatDuration(duration)}\nExpires: <t:${Math.floor(expiresAt / 1000)}:F>`, inline: false }
      )
      .setColor(0xff3030)
      .setThumbnail(targetUser.displayAvatarURL())
      .setTimestamp()
      .setFooter({ text: `Case ID: ${moderationAction.id}` });

    if (!discordTimeoutSuccess && interaction.guild) {
      embed.addFields({ 
        name: '⚠️ Note', 
        value: 'Failed to timeout user in Discord server. User may have higher permissions.', 
        inline: false 
      });
    }

    
    await sendDMNotification(targetUser, reason, duration, interaction.user.tag);

    
    await interaction.editReply({ embeds: [embed] });

    
    await logModerationAction(interaction, embed);

  } catch (error) {
    console.error('Error in timeout command:', error);
    const embed = new EmbedBuilder()
      .setTitle('❌ Error')
      .setDescription('An error occurred while processing the timeout.')
      .setColor(0xff3030)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
}

function parseDuration(durationStr: string): number | null {
  const match = durationStr.match(/^(\d+)([mhd])$/i);
  if (!match) return null;

  const amount = parseInt(match[1]);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 'm': return amount * 60 * 1000; 
    case 'h': return amount * 60 * 60 * 1000; 
    case 'd': return amount * 24 * 60 * 60 * 1000; 
    default: return null;
  }
}

function formatDuration(duration: number): string {
  const days = Math.floor(duration / (24 * 60 * 60 * 1000));
  const hours = Math.floor((duration % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((duration % (60 * 60 * 1000)) / (60 * 1000));

  if (days > 0) {
    return `${days} day${days > 1 ? 's' : ''}${hours > 0 ? ` ${hours} hour${hours > 1 ? 's' : ''}` : ''}`;
  } else if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''}${minutes > 0 ? ` ${minutes} minute${minutes > 1 ? 's' : ''}` : ''}`;
  } else {
    return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  }
}

async function sendDMNotification(user: User, reason: string, duration: number, moderatorTag: string): Promise<void> {
  try {
    const embed = new EmbedBuilder()
      .setTitle('⏰ You have been timed out')
      .setDescription('You have received a timeout on the server.')
      .addFields(
        { name: '📝 Reason', value: reason, inline: false },
        { name: '👮 Moderator', value: moderatorTag, inline: true },
        { name: '⏰ Duration', value: `${formatDuration(duration)}\nExpires: <t:${Math.floor((Date.now() + duration) / 1000)}:F>`, inline: false }
      )
      .setColor(0xff3030)
      .setTimestamp();

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