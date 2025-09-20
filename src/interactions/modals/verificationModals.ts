import { ModalSubmitInteraction } from 'discord.js';
import verifyCommand from '../../commands/verification/verify';

export default {
  customId: 'verification_modals',
  
  async execute(interaction: ModalSubmitInteraction) {
    const customId = interaction.customId;
    
    
    if (customId.startsWith('verify_username_')) {
      const userId = customId.replace('verify_username_', '');
      
      
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