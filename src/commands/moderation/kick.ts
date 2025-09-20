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
  .setName('kick')
  .setDescription('Kick a user from the server')
  .addUserOption(option =>
    option.setName('user')
      .setDescription('The user to kick')
      .setRequired(true)
  )
  .addStringOption(option =>
    option.setName('reason')
      .setDescription('Reason for the kick')
      .setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers);

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true);

    
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.KickMembers)) {
      const embed = new EmbedBuilder()
        .setTitle('❌ Insufficient Permissions')
        .setDescription('You need the "Kick Members" permission to use this command.')
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
      action: 'kick',
      reason,
      isActive: false 
    });

    
    let discordKickSuccess = false;
    if (interaction.guild) {
      try {
        const member = await interaction.guild.members.fetch(targetUser.id);
        if (member) {
          await member.kick(`${reason} | Moderator: ${interaction.user.tag}`);
          discordKickSuccess = true;
        }
      } catch (error) {
        console.error('Failed to kick user from Discord:', error);
      }
    }

    
    const embed = new EmbedBuilder()
      .setTitle('👢 User Kicked')
      .setDescription(`<@${targetUser.id}> has been kicked from the server`)
      .addFields(
        { name: '👤 User', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
        { name: '👮 Moderator', value: `<@${interaction.user.id}>`, inline: true },
        { name: '📝 Reason', value: reason, inline: false }
      )
      .setColor(0xff3030)
      .setThumbnail(targetUser.displayAvatarURL())
      .setTimestamp()
      .setFooter({ text: `Case ID: ${moderationAction.id}` });

    if (!discordKickSuccess && interaction.guild) {
      embed.addFields({ 
        name: '⚠️ Note', 
        value: 'Failed to kick from Discord server. User may have higher permissions or is not in the server.', 
        inline: false 
      });
    }

    
    if (discordKickSuccess) {
      await sendDMNotification(targetUser, 'kick', reason, interaction.user.tag);
    }

    
    await interaction.reply({ embeds: [embed] });

    
    await logModerationAction(interaction, embed);

  } catch (error) {
    console.error('Error in kick command:', error);
    const embed = new EmbedBuilder()
      .setTitle('❌ Error')
      .setDescription('An error occurred while processing the kick.')
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

async function sendDMNotification(user: User, action: string, reason: string, moderatorTag?: string): Promise<void> {
  try {
    const embed = new EmbedBuilder()
      .setTitle('👢 You have been kicked')
      .setDescription('You have been kicked from the server.')
      .addFields(
        { name: '📝 Reason', value: reason, inline: false },
        { name: '👮 Moderator', value: moderatorTag || 'Unknown', inline: true }
      )
      .setColor(0xff3030)
      .setTimestamp();

    embed.addFields({ 
      name: '🔄 Rejoining', 
      value: 'You are free to rejoin the server if you have an invite link, but please follow the server rules.', 
      inline: false 
    });

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