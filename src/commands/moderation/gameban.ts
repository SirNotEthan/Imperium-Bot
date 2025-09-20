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
  .setName('gameban')
  .setDescription('Add or remove a game ban from a user')
  .addStringOption(option =>
    option.setName('action')
      .setDescription('Add or remove game ban')
      .setRequired(true)
      .addChoices(
        { name: 'Add', value: 'add' },
        { name: 'Remove', value: 'remove' }
      )
  )
  .addUserOption(option =>
    option.setName('username')
      .setDescription('The user to add/remove game ban from')
      .setRequired(true)
  )
  .addStringOption(option =>
    option.setName('reason')
      .setDescription('Reason for the game ban action')
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

    
    const existingGameBans = await ModerationLog.findAll({
      where: {
        discordUserId: targetUser.id,
        guildId: interaction.guild?.id || '',
        action: 'gameban',
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
        action: 'gameban',
        reason,
        isActive: true
      });

      
      const embed = new EmbedBuilder()
        .setTitle('🎮 Game Ban Added')
        .setDescription(`<@${targetUser.id}> has received a game ban`)
        .addFields(
          { name: '👤 User', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
          { name: '👮 Moderator', value: `<@${interaction.user.id}>`, inline: true },
          { name: '📝 Reason', value: reason, inline: false },
          { name: '📊 Total Game Bans', value: (existingGameBans.length + 1).toString(), inline: true }
        )
        .setColor(0xFF0000)
        .setThumbnail(targetUser.displayAvatarURL())
        .setTimestamp()
        .setFooter({ text: `Case ID: ${moderationAction.id}` });

      
      await sendDMNotification(targetUser, 'gameban', 'add', reason, interaction.user.tag);

      
      await interaction.reply({ embeds: [embed] });

      
      await logModerationAction(interaction, embed);

    } else { 
      if (existingGameBans.length === 0) {
        const embed = new EmbedBuilder()
          .setTitle('❌ No Game Bans Found')
          .setDescription(`<@${targetUser.id}> has no active game bans to remove.`)
          .setColor(0xff3030)
          .setTimestamp();
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      
      const mostRecentBan = existingGameBans[0];
      await mostRecentBan.update({ isActive: false });

      
      const moderationAction = await ModerationLog.create({
        discordUserId: targetUser.id,
        guildId: interaction.guild?.id || '',
        moderatorId: interaction.user.id,
        action: 'gameban',
        reason: `Removed game ban: ${reason}`,
        isActive: true
      });

      
      const embed = new EmbedBuilder()
        .setTitle('✅ Game Ban Removed')
        .setDescription(`Game ban removed from <@${targetUser.id}>`)
        .addFields(
          { name: '👤 User', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
          { name: '👮 Moderator', value: `<@${interaction.user.id}>`, inline: true },
          { name: '📝 Reason', value: reason, inline: false },
          { name: '🗂️ Previous Ban Reason', value: mostRecentBan.reason, inline: false },
          { name: '📊 Remaining Game Bans', value: (existingGameBans.length - 1).toString(), inline: true }
        )
        .setColor(0x00FF00)
        .setThumbnail(targetUser.displayAvatarURL())
        .setTimestamp()
        .setFooter({ text: `Case ID: ${moderationAction.id}` });

      
      await sendDMNotification(targetUser, 'gameban', 'remove', reason, interaction.user.tag);

      
      await interaction.reply({ embeds: [embed] });

      
      await logModerationAction(interaction, embed);
    }

  } catch (error) {
    console.error('Error in gameban command:', error);
    const embed = new EmbedBuilder()
      .setTitle('❌ Error')
      .setDescription('An error occurred while processing the game ban action.')
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
      title = '🎮 You have received a game ban';
      color = 0xFF0000;
    } else {
      title = '✅ Your game ban has been removed';
      color = 0x00FF00;
    }

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(`You have received a game ban ${action === 'add' ? '' : 'removal '}on the server.`)
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