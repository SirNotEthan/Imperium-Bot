import { ButtonInteraction } from 'discord.js';
import verifyCommand from '../../commands/verification/verify';
import unverifyCommand from '../../commands/verification/unverify';

export default {
  customId: 'verification_buttons',
  
  async execute(interaction: ButtonInteraction) {
    const customId = interaction.customId;
    
    
    if (customId.startsWith('verify_complete_')) {
      const userId = customId.replace('verify_complete_', '');
      
      
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
      
      await verifyCommand.handleVerificationComplete(interaction, userId);
      
    } else if (customId.startsWith('unverify_confirm_')) {
      const userId = customId.replace('unverify_confirm_', '');
      
      
      if (userId !== interaction.user.id) {
        try {
          await interaction.reply({ 
            content: '❌ This unverification is not for you!', 
            ephemeral: true 
          });
        } catch (error) {
          console.error('Failed to send unverification error:', error);
        }
        return;
      }
      
      await unverifyCommand.handleUnverifyConfirm(interaction, userId);
      
    } else if (customId.startsWith('unverify_cancel_')) {
      const userId = customId.replace('unverify_cancel_', '');
      
      
      if (userId !== interaction.user.id) {
        try {
          await interaction.reply({ 
            content: '❌ This unverification is not for you!', 
            ephemeral: true 
          });
        } catch (error) {
          console.error('Failed to send unverification error:', error);
        }
        return;
      }
      
      await unverifyCommand.handleUnverifyCancel(interaction, userId);
    }
  }
};