import { ModalSubmitInteraction } from 'discord.js';
import verifyCommand from '../../commands/verification/verify';

export default {
  customId: 'verification_modals',
  
  async execute(interaction: ModalSubmitInteraction) {
    const customId = interaction.customId;
    
    // Parse the custom ID to get action and user ID
    if (customId.startsWith('verify_username_')) {
      const userId = customId.replace('verify_username_', '');
      
      // Verify this is the correct user
      if (userId !== interaction.user.id) {
        try {
          await interaction.reply({ 
            content: '❌ This verification is not for you!', 
            ephemeral: true 
          });
        } catch (error) {
          console.error('Failed to send verification error:', error);
        }
        return;
      }
      
      await verifyCommand.handleUsernameModal(interaction, userId);
    }
  }
};