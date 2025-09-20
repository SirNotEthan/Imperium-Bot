import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { verificationStorage } from '../../utils/verificationStorage';
import { RobloxAPI, RobloxUser } from '../../utils/robloxAPI';
import { ModerationLog } from '../../database/models';

const COMMUNITY_CONFIG = {
  groupIds: [397892232, 677331375, 1045776713, 892150219 ] as number[],
  gamepassIds: [] as number[]
};

export default {
  data: new SlashCommandBuilder()
    .setName('check')
    .setDescription('Check detailed information about a Roblox player')
    .addStringOption(option =>
      option.setName('roblox_username')
        .setDescription('The Roblox username to check')
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply();

      const robloxUsername = interaction.options.getString('roblox_username', true);

      const robloxUser = await RobloxAPI.getUserByUsername(robloxUsername);
      if (!robloxUser) {
        const embed = new EmbedBuilder()
          .setTitle('User Not Found')
          .setDescription(`Could not find a Roblox user with the username **${robloxUsername}**`)
          .setColor(0xff6b6b)
          .addFields(
            { name: 'Suggestions', value: '• Check the spelling of the username\n• Make sure the user exists on Roblox\n• Try using the exact username (case-sensitive)' }
          );

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const [thumbnail, userGroups, communityStatus] = await Promise.all([
        RobloxAPI.getUserThumbnail(robloxUser.id),
        RobloxAPI.getUserGroups(robloxUser.id),
        RobloxAPI.checkCommunityStatus(robloxUser.id)
      ]);

      const accountAge = RobloxAPI.calculateAccountAge(robloxUser.created);
      const accountAgeFormatted = RobloxAPI.formatAccountAge(accountAge);

      const communityGroups = await RobloxAPI.getCommunityGroups(robloxUser.id, COMMUNITY_CONFIG.groupIds);

      const communityGamepasses = await RobloxAPI.getCommunityGamepasses(robloxUser.id, COMMUNITY_CONFIG.gamepassIds);

      const discordVerification = await verificationStorage.getUserByRobloxId(robloxUser.id);
      const userHistory = discordVerification ? await verificationStorage.getUserHistory(discordVerification.discordId) : null;

      let moderationRecords = null;
      if (discordVerification) {
        moderationRecords = await getModerationRecords(discordVerification.discordId, interaction.guild?.id || '');
      }

      const embed = new EmbedBuilder()
        .setTitle(`Player Information: ${robloxUser.name}`)
        .setColor(0x00AFF4)
        .setThumbnail(thumbnail || '')
        .addFields(
          { name: 'Basic Information', value: '\u200B', inline: false },
          { name: 'Username', value: robloxUser.name, inline: true },
          { name: 'Display Name', value: robloxUser.displayName || robloxUser.name, inline: true },
          { name: 'Roblox ID', value: robloxUser.id.toString(), inline: true },
          { name: 'Account Age', value: accountAgeFormatted, inline: true },
          { name: 'Created', value: `<t:${Math.floor(new Date(robloxUser.created).getTime() / 1000)}:D>`, inline: true }
        );

      embed.addFields(
        { name: 'Profile Link', value: `[View on Roblox](${RobloxAPI.generateProfileUrl(robloxUser.id)})`, inline: false }
      );

      if (robloxUser.description && robloxUser.description.trim()) {
        const description = robloxUser.description.length > 200
          ? robloxUser.description.substring(0, 200) + '...'
          : robloxUser.description;
        embed.addFields(
          { name: 'Description', value: `\`\`\`${description}\`\`\``, inline: false }
        );
      }

      if (moderationRecords) {
        embed.addFields(
          { name: 'Moderation Records', value: '\u200B', inline: false },
          { name: 'Warnings', value: moderationRecords.warnings.toString(), inline: true },
          { name: 'Community Bans', value: moderationRecords.communityBans.toString(), inline: true },
          { name: 'Game Bans', value: moderationRecords.gameBans.toString(), inline: true }
        );

        if (moderationRecords.recentHistory && moderationRecords.recentHistory.length > 0) {
          const historyText = moderationRecords.recentHistory
            .map(record => {
              const timeStamp = `<t:${Math.floor(record.createdAt.getTime() / 1000)}:R>`;
              const reasonText = record.reason.length > 50 ? record.reason.substring(0, 47) + '...' : record.reason;
              return `**${record.action.toUpperCase()}** ${timeStamp}\n└ ${reasonText}`;
            })
            .join('\n\n');

          embed.addFields(
            { name: 'Recent Mod History (Last 5)', value: historyText, inline: false }
          );
        }

      } else {
        embed.addFields(
          { name: 'Community Status', value: '\u200B', inline: false },
          { name: 'Warnings', value: communityStatus.warnings.toString(), inline: true },
          { name: 'Community Bans', value: communityStatus.communityBans.toString(), inline: true },
          { name: 'Game Bans', value: communityStatus.gameBans.toString(), inline: true }
        );
      }

      if (communityGroups.length > 0) {
        const groupsList = communityGroups
          .slice(0, 5)
          .map(userGroup => `• **${userGroup.group.name}** (${userGroup.role.name})`)
          .join('\n');

        embed.addFields(
          { name: 'Community Groups', value: groupsList, inline: false }
        );
      } else {
        embed.addFields(
          { name: 'Community Groups', value: 'No community groups found', inline: false }
        );
      }

      if (communityGamepasses.length > 0) {
        const gamepassList = communityGamepasses
          .slice(0, 5)
          .map(gamepass => `• **${gamepass.name}**`)
          .join('\n');

        embed.addFields(
          { name: 'Community Gamepasses', value: gamepassList, inline: false }
        );
      } else {
        embed.addFields(
          { name: 'Community Gamepasses', value: 'No community gamepasses owned', inline: false }
        );
      }

      if (discordVerification) {
        const discordUser = await interaction.client.users.fetch(discordVerification.discordId).catch(() => null);
        const verificationInfo = discordUser
          ? `${discordUser.tag} (<@${discordUser.id}>)`
          : `Unknown User (${discordVerification.discordId})`;

        embed.addFields(
          { name: 'Discord Connection', value: '\u200B', inline: false },
          { name: 'Linked to', value: verificationInfo, inline: true },
          { name: 'Verified', value: `<t:${Math.floor(discordVerification.verifiedAt.getTime() / 1000)}:R>`, inline: true },
          { name: 'Status', value: 'Verified', inline: true }
        );
      } else {
        embed.addFields(
          { name: 'Discord Connection', value: 'Not verified with any Discord account', inline: false }
        );
      }

      if (userHistory?.previousAccounts && userHistory.previousAccounts.length > 0) {
        const previousAccounts = userHistory.previousAccounts
          .map(account => `• **${account.robloxUsername}** (ID: ${account.robloxId})\n  Linked: <t:${Math.floor(account.linkedAt.getTime() / 1000)}:D> - <t:${Math.floor(account.unlinkedAt.getTime() / 1000)}:D>`)
          .join('\n');

        embed.addFields(
          { name: `Previously Connected Accounts (${userHistory.previousAccounts.length})`, value: previousAccounts, inline: false }
        );
      }

      embed.setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('Error in check command:', error);

      const errorEmbed = new EmbedBuilder()
        .setTitle('Error')
        .setDescription('An error occurred while fetching player information. Please try again later.')
        .setColor(0xff6b6b)
        .addFields(
          { name: 'Possible causes', value: '• Roblox API is temporarily unavailable\n• Invalid username provided\n• Network connectivity issues' }
        );

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },

  setCommunityConfig(groupIds: number[], gamepassIds: number[]) {
    COMMUNITY_CONFIG.groupIds = groupIds;
    COMMUNITY_CONFIG.gamepassIds = gamepassIds;
  },

  getCommunityConfig() {
    return { ...COMMUNITY_CONFIG };
  }
};

async function getModerationRecords(discordUserId: string, guildId: string) {
  try {
    const allRecords = await ModerationLog.findAll({
      where: {
        discordUserId,
        guildId,
        isActive: true
      },
      order: [['createdAt', 'DESC']]
    });

    const warnings = allRecords.filter(record => record.action === 'warning').length;
    const communityBans = allRecords.filter(record => record.action === 'communityban').length;
    const gameBans = allRecords.filter(record => record.action === 'gameban').length;

    const recentHistory = allRecords.slice(0, 5);

    return {
      warnings,
      communityBans,
      gameBans,
      recentHistory
    };
  } catch (error) {
    console.error('Error fetching moderation records:', error);
    return {
      warnings: 0,
      communityBans: 0,
      gameBans: 0,
      recentHistory: []
    };
  }
}


