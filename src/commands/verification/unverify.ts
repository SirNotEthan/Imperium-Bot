import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { verificationStorage } from '../../utils/verificationStorage';
import { RobloxAPI } from '../../utils/robloxAPI';

export default {
  data: new SlashCommandBuilder()
    .setName('unverify')
    .setDescription('Remove your Roblox account verification from this Discord account'),

  async execute(interaction: ChatInputCommandInteraction) {
    try {
      const userId = interaction.user.id;

      // Check if user is verified
      const verifiedUser = await verificationStorage.getVerifiedUser(userId);
      if (!verifiedUser) {
        const embed = new EmbedBuilder()
          .setTitle('❌ Not Verified')
          .setDescription('You are not currently verified with a Roblox account.')
          .setColor(0xff6b6b)
          .addFields(
            { name: 'Want to verify?', value: 'Use `/verify` to link your Roblox account!' }
          );

        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      // Show confirmation with current verification details
      const accountAge = RobloxAPI.calculateAccountAge(verifiedUser.verifiedAt.toISOString());
      const thumbnail = await RobloxAPI.getUserThumbnail(verifiedUser.robloxId);

      const confirmEmbed = new EmbedBuilder()
        .setTitle('⚠️ Confirm Unverification')
        .setDescription('Are you sure you want to unlink your Roblox account from Discord?')
        .setColor(0xffa500)
        .addFields(
          { name: 'Currently Verified As', value: `**${verifiedUser.robloxUsername}**`, inline: true },
          { name: 'Roblox ID', value: verifiedUser.robloxId.toString(), inline: true },
          { name: 'Verified Since', value: `<t:${Math.floor(verifiedUser.verifiedAt.getTime() / 1000)}:R>`, inline: true },
          { name: 'Profile Link', value: `[View Profile](${RobloxAPI.generateProfileUrl(verifiedUser.robloxId)})`, inline: false },
          { 
            name: '⚠️ Warning', 
            value: '• Your verification history will be preserved for `/check` commands\n• You can re-verify with the same or different Roblox account later\n• Your Discord nickname may be reset', 
            inline: false 
          }
        )
        .setThumbnail(thumbnail || '')
        .setFooter({ 
          text: 'This action can be reversed by using /verify again',
          iconURL: 'https://www.roblox.com/favicon.ico'
        });

      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`unverify_confirm_${userId}`)
            .setLabel('Yes, Unverify')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('❌'),
          new ButtonBuilder()
            .setCustomId(`unverify_cancel_${userId}`)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🚫')
        );

      await interaction.reply({ 
        embeds: [confirmEmbed], 
        components: [row], 
        ephemeral: true 
      });

    } catch (error) {
      console.error('Error in unverify command:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Unverification Error')
        .setDescription('An error occurred while processing your unverification request. Please try again later.')
        .setColor(0xff6b6b);

      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  },

  // Handle unverification confirmation
  async handleUnverifyConfirm(interaction: any, userId: string): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const verifiedUser = await verificationStorage.getVerifiedUser(userId);
      if (!verifiedUser) {
        const embed = new EmbedBuilder()
          .setTitle('❌ Not Verified')
          .setDescription('You are not currently verified with a Roblox account.')
          .setColor(0xff6b6b);

        await interaction.editReply({ embeds: [embed], components: [] });
        return;
      }

      // Store data for confirmation message before unverifying
      const robloxUsername = verifiedUser.robloxUsername;
      const robloxId = verifiedUser.robloxId;

      // Unverify the user
      const success = await verificationStorage.unverifyUser(userId);
      if (!success) {
        const embed = new EmbedBuilder()
          .setTitle('❌ Unverification Failed')
          .setDescription('Failed to remove your verification. Please try again.')
          .setColor(0xff6b6b);

        await interaction.editReply({ embeds: [embed], components: [] });
        return;
      }

      // Try to reset Discord nickname
      let nicknameReset = false;
      if (interaction.guild) {
        try {
          const member = await interaction.guild.members.fetch(userId);
          const botMember = interaction.guild.members.me;
          
          if (member && botMember?.permissions.has('ManageNicknames') && member.manageable) {
            await member.setNickname(null, 'Roblox unverification');
            nicknameReset = true;
          }
        } catch (error) {
          console.log('Could not reset nickname:', error);
        }
      }

      // Success message
      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Successfully Unverified')
        .setDescription(`Your Discord account has been unlinked from **${robloxUsername}**`)
        .setColor(0x4CAF50)
        .addFields(
          { name: 'Previous Account', value: `${robloxUsername} (ID: ${robloxId})`, inline: true },
          { name: 'Status', value: 'Unverified', inline: true },
          { name: 'Nickname', value: nicknameReset ? '✅ Reset to default' : '❌ Could not reset (insufficient permissions)', inline: false },
          { name: 'History Preserved', value: 'Your verification history is still available via `/check`', inline: false },
          { name: 'Want to verify again?', value: 'Use `/verify` to link your Roblox account!', inline: false }
        )
        .setFooter({ 
          text: 'Unverification completed successfully',
          iconURL: 'https://www.roblox.com/favicon.ico'
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [successEmbed], components: [] });

    } catch (error) {
      console.error('Error in unverify confirmation:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Unverification Error')
        .setDescription('An error occurred while removing your verification. Please try again.')
        .setColor(0xff6b6b);

      await interaction.editReply({ embeds: [errorEmbed], components: [] });
    }
  },

  // Handle unverification cancellation
  async handleUnverifyCancel(interaction: any, userId: string): Promise<void> {
    try {
      const embed = new EmbedBuilder()
        .setTitle('❌ Unverification Cancelled')
        .setDescription('Your verification remains unchanged.')
        .setColor(0x4CAF50)
        .addFields(
          { name: 'Status', value: 'Still verified', inline: true }
        );

      await interaction.reply({ embeds: [embed], ephemeral: true });

    } catch (error) {
      console.error('Error in unverify cancellation:', error);
    }
  }
};