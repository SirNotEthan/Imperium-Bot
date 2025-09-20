import { 
  ChatInputCommandInteraction, 
  SlashCommandBuilder, 
  EmbedBuilder,
  PermissionFlagsBits,
  TextChannel 
} from 'discord.js';
import { User as UserModel, ModerationLog } from '../../database/models';

const data = new SlashCommandBuilder()
  .setName('unban')
  .setDescription('Unban a user')
  .addStringOption(option =>
    option.setName('user')
      .setDescription('The user to unban (username or user ID)')
      .setRequired(true)
  )
  .addStringOption(option =>
    option.setName('reason')
      .setDescription('Reason for the unban')
      .setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers);

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const userInput = interaction.options.getString('user', true);
    const reason = interaction.options.getString('reason', true);

    
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.BanMembers)) {
      const embed = new EmbedBuilder()
        .setTitle('❌ Insufficient Permissions')
        .setDescription('You need the "Ban Members" permission to use this command.')
        .setColor(0xff3030)
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    let targetUserId: string;
    let targetUser: any = null;

    
    if (/^\d{17,19}$/.test(userInput)) {
      targetUserId = userInput;
      try {
        targetUser = await interaction.client.users.fetch(targetUserId);
      } catch (error) {
        
      }
    } else {
      
      const userData = await UserModel.findOne({ where: { robloxUsername: userInput } });
      if (!userData) {
        const embed = new EmbedBuilder()
          .setTitle('❌ User Not Found')
          .setDescription(`No user found with Roblox username **${userInput}**`)
          .setColor(0xff3030)
          .setTimestamp();
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
      }
      targetUserId = userData.discordId;
      try {
        targetUser = await interaction.client.users.fetch(targetUserId);
      } catch (error) {
        
      }
    }

    
    const existingBan = await ModerationLog.findOne({
      where: {
        discordUserId: targetUserId,
        guildId: interaction.guild?.id || '',
        action: 'ban',
        isActive: true
      },
      order: [['createdAt', 'DESC']]
    });
    
    if (!existingBan || (existingBan.expiresAt && existingBan.expiresAt <= new Date())) {
      const displayName = targetUser ? targetUser.tag : `User ID: ${targetUserId}`;
      const embed = new EmbedBuilder()
        .setTitle('❌ User Not Banned')
        .setDescription(`**${displayName}** is not currently banned.`)
        .setColor(0xff3030)
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    
    await existingBan.update({ isActive: false });

    
    const moderationAction = await ModerationLog.create({
      discordUserId: targetUserId,
      guildId: interaction.guild?.id || '',
      moderatorId: interaction.user.id,
      action: 'unban',
      reason,
      isActive: false 
    });

    
    let discordUnbanSuccess = false;
    if (interaction.guild) {
      try {
        await interaction.guild.members.unban(targetUserId, `${reason} | Moderator: ${interaction.user.tag}`);
        discordUnbanSuccess = true;
      } catch (error) {
        console.error('Failed to unban user from Discord:', error);
      }
    }

    
    const userData = await UserModel.findOne({ where: { discordId: targetUserId } });
    const displayName = targetUser ? targetUser.tag : (userData?.robloxUsername || `User ID: ${targetUserId}`);
    const displayId = targetUser ? targetUser.id : targetUserId;

    
    const embed = new EmbedBuilder()
      .setTitle('✅ User Unbanned')
      .setDescription(`**${displayName}** has been unbanned`)
      .addFields(
        { name: '👤 User', value: `${displayName} (${displayId})`, inline: true },
        { name: '👮 Moderator', value: `<@${interaction.user.id}>`, inline: true },
        { name: '📝 Reason', value: reason, inline: false },
        { name: '📋 Original Ban', value: existingBan.reason, inline: false }
      )
      .setColor(0x4CAF50)
      .setTimestamp()
      .setFooter({ text: `Case ID: ${moderationAction.id}` });

    if (targetUser) {
      embed.setThumbnail(targetUser.displayAvatarURL());
    }

    if (!discordUnbanSuccess && interaction.guild) {
      embed.addFields({ 
        name: '⚠️ Note', 
        value: 'Failed to unban from Discord server. User may not have been banned on Discord or bot lacks permissions.', 
        inline: false 
      });
    }

    
    await interaction.reply({ embeds: [embed] });

    
    await logModerationAction(interaction, embed);

  } catch (error) {
    console.error('Error in unban command:', error);
    const embed = new EmbedBuilder()
      .setTitle('❌ Error')
      .setDescription('An error occurred while processing the unban.')
      .setColor(0xff3030)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
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