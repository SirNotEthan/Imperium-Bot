import { 
  ChatInputCommandInteraction, 
  SlashCommandBuilder, 
  EmbedBuilder,
  PermissionFlagsBits,
  TextChannel 
} from 'discord.js';
import { User as UserModel, ModerationLog } from '../../database/models';

const data = new SlashCommandBuilder()
  .setName('unmute')
  .setDescription('Unmute a user')
  .addUserOption(option =>
    option.setName('user')
      .setDescription('The user to unmute')
      .setRequired(true)
  )
  .addStringOption(option =>
    option.setName('reason')
      .setDescription('Reason for the unmute')
      .setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true);

    
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
      const embed = new EmbedBuilder()
        .setTitle('❌ Insufficient Permissions')
        .setDescription('You need the "Moderate Members" permission to use this command.')
        .setColor(0xff3030)
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
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
    
    if (!existingMute || (existingMute.expiresAt && existingMute.expiresAt <= new Date())) {
      const embed = new EmbedBuilder()
        .setTitle('❌ User Not Muted')
        .setDescription(`<@${targetUser.id}> is not currently muted or timed out.`)
        .setColor(0xff3030)
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    
    await existingMute.update({ isActive: false });

    
    const moderationAction = await ModerationLog.create({
      discordUserId: targetUser.id,
      guildId: interaction.guild?.id || '',
      moderatorId: interaction.user.id,
      action: 'unmute',
      reason,
      isActive: false 
    });

    
    let discordUnmuteSuccess = false;
    if (interaction.guild) {
      try {
        const member = await interaction.guild.members.fetch(targetUser.id);
        if (member && member.isCommunicationDisabled()) {
          await member.timeout(null, `${reason} | Moderator: ${interaction.user.tag}`);
          discordUnmuteSuccess = true;
        }
      } catch (error) {
        console.error('Failed to remove timeout from Discord user:', error);
      }
    }

    
    const actionType = existingMute.action === 'timeout' ? 'Timeout Removed' : 'User Unmuted';
    const embed = new EmbedBuilder()
      .setTitle(`🔊 ${actionType}`)
      .setDescription(`<@${targetUser.id}> has been ${existingMute.action === 'timeout' ? 'untimedout' : 'unmuted'}`)
      .addFields(
        { name: '👤 User', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
        { name: '👮 Moderator', value: `<@${interaction.user.id}>`, inline: true },
        { name: '📝 Reason', value: reason, inline: false },
        { name: `📋 Original ${existingMute.action === 'timeout' ? 'Timeout' : 'Mute'}`, value: existingMute.reason, inline: false }
      )
      .setColor(0x4CAF50)
      .setThumbnail(targetUser.displayAvatarURL())
      .setTimestamp()
      .setFooter({ text: `Case ID: ${moderationAction.id}` });

    if (!discordUnmuteSuccess && interaction.guild) {
      embed.addFields({ 
        name: '⚠️ Note', 
        value: 'No Discord timeout to remove or user not found. Internal mute status has been cleared.', 
        inline: false 
      });
    }

    
    await interaction.reply({ embeds: [embed] });

    
    await logModerationAction(interaction, embed);

  } catch (error) {
    console.error('Error in unmute command:', error);
    const embed = new EmbedBuilder()
      .setTitle('❌ Error')
      .setDescription('An error occurred while processing the unmute.')
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