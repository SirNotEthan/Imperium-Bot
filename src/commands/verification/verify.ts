import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { verificationStorage } from '../../utils/verificationStorage';
import { RobloxAPI } from '../../utils/robloxAPI';

function generateVerificationCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

const pendingVerifications = new Map<string, { code: string; timestamp: number }>();

export default {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verify your Roblox account by adding a code to your profile description'),

  async execute(interaction: ChatInputCommandInteraction) {
    try {
      const userId = interaction.user.id;

      // Check if user is already verified
      if (await verificationStorage.isDiscordVerified(userId)) {
        const verifiedUser = await verificationStorage.getVerifiedUser(userId);
        const embed = new EmbedBuilder()
          .setTitle('❌ Already Verified')
          .setDescription(`You are already verified as **${verifiedUser?.robloxUsername}**`)
          .setColor(0xff6b6b)
          .addFields(
            { name: 'Roblox Profile', value: `[${verifiedUser?.robloxUsername}](${RobloxAPI.generateProfileUrl(verifiedUser?.robloxId || 0)})`, inline: true },
            { name: 'Verified Since', value: `<t:${Math.floor((verifiedUser?.verifiedAt.getTime() || 0) / 1000)}:R>`, inline: true }
          );

        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      // Generate verification code
      const verificationCode = generateVerificationCode();
      const timestamp = Date.now();

      // Store pending verification
      pendingVerifications.set(userId, { code: verificationCode, timestamp });

      // Clean up old pending verifications (older than 10 minutes)
      for (const [key, value] of pendingVerifications.entries()) {
        if (timestamp - value.timestamp > 10 * 60 * 1000) {
          pendingVerifications.delete(key);
        }
      }

      const embed = new EmbedBuilder()
        .setTitle('🔐 Roblox Verification')
        .setDescription('To verify your Roblox account, follow these steps:')
        .setColor(0x4CAF50)
        .addFields(
          { 
            name: '1️⃣ Copy this code:', 
            value: `\`\`\`${verificationCode}\`\`\``, 
            inline: false 
          },
          { 
            name: '2️⃣ Add it to your Roblox profile description:', 
            value: '• Go to [Roblox.com](https://www.roblox.com)\n• Click on your profile\n• Click "Edit Profile"\n• Add the code to your description\n• Save your profile', 
            inline: false 
          },
          { 
            name: '3️⃣ Complete verification:', 
            value: 'Use the button below to complete verification', 
            inline: false 
          }
        )
        .setFooter({ 
          text: 'This code expires in 10 minutes',
          iconURL: 'https://www.roblox.com/favicon.ico'
        })
        .setTimestamp();

      // Create verification button
      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`verify_complete_${userId}`)
            .setLabel('Complete Verification')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('✅')
        );

      await interaction.reply({ 
        embeds: [embed], 
        components: [row], 
        ephemeral: true 
      });

    } catch (error) {
      console.error('Error in verify command:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Verification Error')
        .setDescription('An error occurred while setting up verification. Please try again later.')
        .setColor(0xff6b6b);

      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
        } else {
          await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
      } catch (followUpError) {
        console.error('Failed to send error response:', followUpError);
      }
    }
  },

  // Handle verification completion
  async handleVerificationComplete(interaction: any, userId: string): Promise<void> {
    try {
      const pending = pendingVerifications.get(userId);
      if (!pending) {
        const embed = new EmbedBuilder()
          .setTitle('❌ Verification Expired')
          .setDescription('Your verification code has expired. Please use `/verify` again.')
          .setColor(0xff6b6b);

        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      // Check if code expired (10 minutes)
      if (Date.now() - pending.timestamp > 10 * 60 * 1000) {
        pendingVerifications.delete(userId);
        const embed = new EmbedBuilder()
          .setTitle('❌ Verification Expired')
          .setDescription('Your verification code has expired. Please use `/verify` again.')
          .setColor(0xff6b6b);

        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      // Show modal for Roblox username input
      const modal = new ModalBuilder()
        .setCustomId(`verify_username_${userId}`)
        .setTitle('Roblox Username');

      const usernameInput = new TextInputBuilder()
        .setCustomId('roblox_username')
        .setLabel('Your Roblox Username')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter your exact Roblox username...')
        .setRequired(true)
        .setMaxLength(20);

      const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(usernameInput);
      modal.addComponents(firstActionRow);

      await interaction.showModal(modal);

    } catch (error) {
      console.error('Error in verification completion:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Verification Error')
        .setDescription('An error occurred during verification. Please try again.')
        .setColor(0xff6b6b);

      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
        } else {
          await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
      } catch (followUpError) {
        console.error('Failed to send error response:', followUpError);
      }
    }
  },

  // Handle username modal submission
  async handleUsernameModal(interaction: any, userId: string): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const pending = pendingVerifications.get(userId);
      if (!pending) {
        const embed = new EmbedBuilder()
          .setTitle('❌ Verification Expired')
          .setDescription('Your verification session has expired. Please use `/verify` again.')
          .setColor(0xff6b6b);

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const robloxUsername = interaction.fields.getTextInputValue('roblox_username');

      // Fetch Roblox user data
      const robloxUser = await RobloxAPI.getUserByUsername(robloxUsername);
      if (!robloxUser) {
        const embed = new EmbedBuilder()
          .setTitle('❌ User Not Found')
          .setDescription(`Could not find a Roblox user with the username **${robloxUsername}**`)
          .setColor(0xff6b6b);

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Check if Roblox account is already linked
      if (await verificationStorage.isRobloxLinked(robloxUser.id)) {
        const embed = new EmbedBuilder()
          .setTitle('❌ Account Already Linked')
          .setDescription(`The Roblox account **${robloxUser.name}** is already linked to another Discord account.`)
          .setColor(0xff6b6b);

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Check if verification code is in description
      if (!robloxUser.description.includes(pending.code)) {
        const embed = new EmbedBuilder()
          .setTitle('❌ Verification Code Not Found')
          .setDescription(`The verification code \`${pending.code}\` was not found in your Roblox profile description.`)
          .setColor(0xff6b6b)
          .addFields(
            { name: 'Make sure to:', value: '• Add the code to your profile description\n• Save your profile changes\n• Wait a few minutes for changes to sync' }
          );

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Complete verification
      const success = await verificationStorage.verifyUser(userId, robloxUser.id, robloxUser.name);
      if (!success) {
        const embed = new EmbedBuilder()
          .setTitle('❌ Verification Failed')
          .setDescription('Failed to complete verification. Please try again.')
          .setColor(0xff6b6b);

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Clean up pending verification
      pendingVerifications.delete(userId);

      // Update Discord nickname
      let nicknameUpdated = false;
      if (interaction.guild) {
        try {
          const member = await interaction.guild.members.fetch(userId);
          const botMember = interaction.guild.members.me;
          
          if (member && botMember?.permissions.has('ManageNicknames') && member.manageable) {
            await member.setNickname(robloxUser.name, 'Roblox verification');
            nicknameUpdated = true;
          }
        } catch (error) {
          console.log('Could not update nickname:', error);
        }
      }

      // Get user thumbnail
      const thumbnail = await RobloxAPI.getUserThumbnail(robloxUser.id);
      const accountAge = RobloxAPI.calculateAccountAge(robloxUser.created);

      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Verification Successful!')
        .setDescription(`Your Discord account has been successfully linked to **${robloxUser.name}**`)
        .setColor(0x4CAF50)
        .addFields(
          { name: 'Roblox Username', value: robloxUser.name, inline: true },
          { name: 'Display Name', value: robloxUser.displayName, inline: true },
          { name: 'Account Age', value: RobloxAPI.formatAccountAge(accountAge), inline: true },
          { name: 'Profile Link', value: `[View Profile](${RobloxAPI.generateProfileUrl(robloxUser.id)})`, inline: true },
          { name: 'Nickname', value: nicknameUpdated ? '✅ Updated to your Roblox username' : '❌ Could not update (insufficient permissions)', inline: false }
        )
        .setThumbnail(thumbnail || '')
        .setFooter({ 
          text: 'Your account is now verified!',
          iconURL: 'https://www.roblox.com/favicon.ico'
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [successEmbed] });

    } catch (error) {
      console.error('Error in username modal handling:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Verification Error')
        .setDescription('An error occurred during verification. Please try again.')
        .setColor(0xff6b6b);

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },

  // Export for external access
  pendingVerifications
};