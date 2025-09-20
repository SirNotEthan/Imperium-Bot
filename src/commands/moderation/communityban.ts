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
  .setName('communityban')
  .setDescription('Add or remove a community ban from a user')
  .addStringOption(option =>
    option.setName('action')
      .setDescription('Add or remove community ban')
      .setRequired(true)
      .addChoices(
        { name: 'Add', value: 'add' },
        { name: 'Remove', value: 'remove' }
      )
  )
  .addUserOption(option =>
    option.setName('username')
      .setDescription('The user to add/remove community ban from')
      .setRequired(true)
  )
  .addStringOption(option =>
    option.setName('reason')
      .setDescription('Reason for the community ban action')
      .setRequired(true)
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const action = interaction.options.getString('action', true) as 'add' | 'remove';
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

    
    const existingCommunityBans = await ModerationLog.findAll({
      where: {
        discordUserId: targetUser.id,
        guildId: interaction.guild?.id || '',
        action: 'communityban',
        isActive: true
      },
      order: [['createdAt', 'DESC']]
    });

    if (action === 'add') {
      
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
        action: 'communityban',
        reason,
        isActive: true
      });

      
      const embed = new EmbedBuilder()
        .setTitle('🚫 Community Ban Added')
        .setDescription(`<@${targetUser.id}> has received a community ban`)
        .addFields(
          { name: '👤 User', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
          { name: '👮 Moderator', value: `<@${interaction.user.id}>`, inline: true },
          { name: '📝 Reason', value: reason, inline: false },
          { name: '📊 Total Community Bans', value: (existingCommunityBans.length + 1).toString(), inline: true }
        )
        .setColor(0x8B0000)
        .setThumbnail(targetUser.displayAvatarURL())
        .setTimestamp()
        .setFooter({ text: `Case ID: ${moderationAction.id}` });

      
      await sendDMNotification(targetUser, 'communityban', 'add', reason, interaction.user.tag);

      
      await interaction.reply({ embeds: [embed] });

      
      await logModerationAction(interaction, embed);

    } else { 
      if (existingCommunityBans.length === 0) {
        const embed = new EmbedBuilder()
          .setTitle('❌ No Community Bans Found')
          .setDescription(`<@${targetUser.id}> has no active community bans to remove.`)
          .setColor(0xff3030)
          .setTimestamp();
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      
      const mostRecentBan = existingCommunityBans[0];
      await mostRecentBan.update({ isActive: false });

      
      const moderationAction = await ModerationLog.create({
        discordUserId: targetUser.id,
        guildId: interaction.guild?.id || '',
        moderatorId: interaction.user.id,
        action: 'communityban',
        reason: `Removed community ban: ${reason}`,
        isActive: true
      });

      
      const embed = new EmbedBuilder()
        .setTitle('✅ Community Ban Removed')
        .setDescription(`Community ban removed from <@${targetUser.id}>`)
        .addFields(
          { name: '👤 User', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
          { name: '👮 Moderator', value: `<@${interaction.user.id}>`, inline: true },
          { name: '📝 Reason', value: reason, inline: false },
          { name: '🗂️ Previous Ban Reason', value: mostRecentBan.reason, inline: false },
          { name: '📊 Remaining Community Bans', value: (existingCommunityBans.length - 1).toString(), inline: true }
        )
        .setColor(0x00FF00)
        .setThumbnail(targetUser.displayAvatarURL())
        .setTimestamp()
        .setFooter({ text: `Case ID: ${moderationAction.id}` });

      
      await sendDMNotification(targetUser, 'communityban', 'remove', reason, interaction.user.tag);

      
      await interaction.reply({ embeds: [embed] });

      
      await logModerationAction(interaction, embed);
    }

  } catch (error) {
    console.error('Error in communityban command:', error);
    const embed = new EmbedBuilder()
      .setTitle('❌ Error')
      .setDescription('An error occurred while processing the community ban action.')
      .setColor(0xff3030)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

async function sendDMNotification(user: User, type: string, action: string, reason: string, moderatorTag: string): Promise<void> {
  try {
    let title: string;
    let color: number;

    if (action === 'add') {
      title = '🚫 You have received a community ban';
      color = 0x8B0000;
    } else {
      title = '✅ Your community ban has been removed';
      color = 0x00FF00;
    }

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(`You have received a community ban ${action === 'add' ? '' : 'removal '}on the server.`)
      .addFields(
        { name: '📝 Reason', value: reason, inline: false },
        { name: '👮 Moderator', value: moderatorTag, inline: true }
      )
      .setColor(color)
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