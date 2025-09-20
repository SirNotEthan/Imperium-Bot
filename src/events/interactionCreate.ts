import { Client, Collection, ChatInputCommandInteraction, SlashCommandBuilder, ButtonInteraction, ModalSubmitInteraction, StringSelectMenuInteraction } from 'discord.js';
import type { Interaction } from 'discord.js';

export interface Command {
    data: SlashCommandBuilder;
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export const name = 'interactionCreate';
export const once = false;

export async function execute(interaction: Interaction): Promise<void> {
    const client = interaction.client as Client;

    try {
        if (interaction.isChatInputCommand()) {
            await handleChatInputCommand(interaction, client);
        } else if (interaction.isButton()) {
            await handleButtonInteraction(interaction);
        } else if (interaction.isStringSelectMenu()) {
            await handleSelectMenuInteraction(interaction);
        } else if (interaction.isModalSubmit()) {
            await handleModalInteraction(interaction);
        }
    } catch (error) {
        console.error('Unexpected interaction handling error:', error);
    }
}

async function handleChatInputCommand(
  interaction: ChatInputCommandInteraction,
  client: Client
): Promise<void> {
  const { commands } = client;

  if (!commands?.has(interaction.commandName)) {
    console.warn(`Unknown command: ${interaction.commandName}`);
    return sendErrorResponse(
      interaction,
      `Command \`${interaction.commandName}\` not found.`,
      `Unknown command: ${interaction.commandName}`,
      'command_not_found',
    );
  }

  const command = commands.get(interaction.commandName)!;

  try {
    console.log(`Running /${interaction.commandName} by ${interaction.user.tag}`);
    const start = Date.now();
    await command.execute(interaction);
    const ms = Date.now() - start;
    console.log(`${interaction.commandName} executed in ${ms}ms`);
  } catch (err) {
    console.error(`Error in command ${interaction.commandName}:`, err);
    await sendErrorResponse(
      interaction,
      'Something went wrong while executing the command.',
      err instanceof Error ? err : new Error(String(err)),
      'command_execution_error'
    );
  }
}

async function handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
  console.log(`Button: ${interaction.customId} by ${interaction.user.tag}`);
  const client = interaction.client as Client & { buttons?: Collection<string, any> };

  try {
    if (interaction.customId.startsWith('verify_complete_') || 
        interaction.customId.startsWith('unverify_confirm_') || 
        interaction.customId.startsWith('unverify_cancel_')) {
      
      const { default: verificationButtons } = await import('../interactions/buttons/verificationButtons');
      await verificationButtons.execute(interaction);
      return;
    }

    if (interaction.customId === 'ping_refresh') {
      return;
    }

    if (client.buttons?.has(interaction.customId)) {
      const buttonHandler = client.buttons.get(interaction.customId);
      await buttonHandler.execute(interaction);
      return;
    }
    
    console.info(`Unhandled button: ${interaction.customId}`);
    await sendErrorResponse(
      interaction,
      'This button interaction is not currently supported.',
      `Unhandled button: ${interaction.customId}`,
      'button_not_handled'
    );
    
  } catch (err) {
    console.error(`Button error (${interaction.customId}):`, err);
    await sendErrorResponse(
      interaction,
      'Something went wrong while handling this button.',
      err instanceof Error ? err : new Error(String(err)),
      'button_execution_error'
    );
  }
}

async function handleSelectMenuInteraction(interaction: StringSelectMenuInteraction): Promise<void> {
  console.log(`Select Menu: ${interaction.customId} by ${interaction.user.tag}`);
  const client = interaction.client as Client & { selectMenus?: Collection<string, any> };

  try {
    if (client.selectMenus?.has(interaction.customId)) {
      const selectMenuHandler = client.selectMenus.get(interaction.customId);
      await selectMenuHandler.execute(interaction);
      return;
    }
    
    console.info(`Unhandled select menu: ${interaction.customId}`);
    await sendErrorResponse(
      interaction,
      'This select menu interaction is not currently supported.',
      `Unhandled select menu: ${interaction.customId}`,
      'select_menu_not_handled'
    );
    
  } catch (err) {
    console.error(`Select menu error (${interaction.customId}):`, err);
    await sendErrorResponse(
      interaction,
      'Something went wrong while handling this select menu.',
      err instanceof Error ? err : new Error(String(err)),
      'select_menu_execution_error'
    );
  }
}

async function handleModalInteraction(interaction: ModalSubmitInteraction): Promise<void> {
  console.log(`Modal: ${interaction.customId} by ${interaction.user.tag}`);
  const client = interaction.client as Client & { modals?: Collection<string, any> };

  try {
    if (interaction.customId.startsWith('verify_username_')) {
      const { default: verificationModals } = await import('../interactions/modals/verificationModals');
      await verificationModals.execute(interaction);
      return;
    }

    if (client.modals?.has(interaction.customId)) {
      const modalHandler = client.modals.get(interaction.customId);
      await modalHandler.execute(interaction);
      return;
    }
    
    console.info(`Unhandled modal: ${interaction.customId}`);
    await sendErrorResponse(
      interaction,
      'This modal interaction is not currently supported.',
      `Unhandled modal: ${interaction.customId}`,
      'modal_not_handled'
    );
    
  } catch (err) {
    console.error(`Modal error (${interaction.customId}):`, err);
    await sendErrorResponse(
      interaction,
      'Something went wrong while handling this modal.',
      err instanceof Error ? err : new Error(String(err)),
      'modal_execution_error'
    );
  }
}

async function sendErrorResponse(
  interaction: ChatInputCommandInteraction | ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction,
  userMessage: string,
  error: string | Error,
  errorType: string,
): Promise<void> {
  const message = { content: userMessage, ephemeral: true };

  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(message);
    } else {
      await interaction.reply(message);
    }
  } catch (replyErr) {
    console.error('Failed to reply with error:', replyErr);
  }
}