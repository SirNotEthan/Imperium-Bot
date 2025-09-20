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
  .setName('untimeout')
  .setDescription('Remove timeout from a user')
  .addUserOption(option =>
    option.setName('username')
      .setDescription('The user to remove timeout from')
      .setRequired(true)
  )
  .addStringOption(option =>
    option.setName('reason')
      .setDescription('Reason for removing the timeout')
      .setRequired(true)
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const targetUser = interaction.options.getUser('username', true);
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
      
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    // Check if user is currently timed out
    const existingTimeout = await ModerationLog.findOne({
      where: {
        discordUserId: targetUser.id,
        guildId: interaction.guild?.id || '',
        action: 'timeout',
        isActive: true
      },
      order: [['createdAt', 'DESC']]
    });
    
    if (!existingTimeout || !existingTimeout.expiresAt || existingTimeout.expiresAt <= new Date()) {
      const embed = new EmbedBuilder()
        .setTitle('❌ User Not Timed Out')
        .setDescription(`<@${targetUser.id}> is not currently timed out.`)
        .setColor(0xff3030)
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    // Deactivate the timeout log entry
    await existingTimeout.update({ isActive: false });

    // Get or create user data
    let userData = await UserModel.findOne({ where: { discordId: targetUser.id } });
    if (!userData) {
      userData = await UserModel.create({
        discordId: targetUser.id,
        messageCount: 0,
        level: 0
      });
    }

    // Create untimeout log entry
    const moderationAction = await ModerationLog.create({
      discordUserId: targetUser.id,
      guildId: interaction.guild?.id || '',
      moderatorId: interaction.user.id,
      action: 'untimeout',
      reason,
      isActive: true
    });

    // Try to remove timeout in Discord
    let discordUntimeoutSuccess = false;
    if (interaction.guild) {
      try {
        const targetMember = await interaction.guild.members.fetch(targetUser.id);
        await targetMember.timeout(null, `${reason} | Moderator: ${interaction.user.tag}`);
        discordUntimeoutSuccess = true;
      } catch (error) {
        console.error('Failed to remove timeout from user in Discord:', error);
      }
    }

    // Create untimeout embed
    const embed = new EmbedBuilder()
      .setTitle('✅ Timeout Removed')
      .setDescription(`<@${targetUser.id}>'s timeout has been removed`)
      .addFields(
        { name: '👤 User', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
        { name: '👮 Moderator', value: `<@${interaction.user.id}>`, inline: true },
        { name: '📝 Reason', value: reason, inline: false },
        { name: '⏰ Previous Timeout', value: `**Reason:** ${existingTimeout.reason}\n**Original Expiry:** <t:${Math.floor(existingTimeout.expiresAt.getTime() / 1000)}:F>`, inline: false }
      )
      .setColor(0x00FF00)
      .setThumbnail(targetUser.displayAvatarURL())
      .setTimestamp()
      .setFooter({ text: `Case ID: ${moderationAction.id}` });

    if (!discordUntimeoutSuccess && interaction.guild) {
      embed.addFields({ 
        name: '⚠️ Note', 
        value: 'Failed to remove timeout in Discord server. User may have already left the server.', 
        inline: false 
      });
    }

    // Send DM to user
    await sendDMNotification(targetUser, reason, interaction.user.tag);

    // Send response
    await interaction.reply({ embeds: [embed] });

    // Log to moderation channel if configured
    await logModerationAction(interaction, embed);

  } catch (error) {
    console.error('Error in untimeout command:', error);
    const embed = new EmbedBuilder()
      .setTitle('❌ Error')
      .setDescription('An error occurred while removing the timeout.')
      .setColor(0xff3030)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

async function sendDMNotification(user: User, reason: string, moderatorTag: string): Promise<void> {
  try {
    const embed = new EmbedBuilder()
      .setTitle('✅ Your timeout has been removed')
      .setDescription('Your timeout has been lifted from the server.')
      .addFields(
        { name: '📝 Reason', value: reason, inline: false },
        { name: '👮 Moderator', value: moderatorTag, inline: true }
      )
      .setColor(0x00FF00)
      .setTimestamp();

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