import { 
  ChatInputCommandInteraction, 
  SlashCommandBuilder, 
  EmbedBuilder,
  User 
} from 'discord.js';
import { dataStorage } from '../../utils/dataStorage';

const data = new SlashCommandBuilder()
  .setName('messages')
  .setDescription('View message statistics and leaderboard')
  .addUserOption(option =>
    option.setName('user')
      .setDescription('View specific user\'s message count')
      .setRequired(false)
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const targetUser = interaction.options.getUser('user');

    if (targetUser) {
      await showUserStats(interaction, targetUser);
    } else {
      await showLeaderboard(interaction);
    }

  } catch (error) {
    console.error('Error in messages command:', error);
    const embed = new EmbedBuilder()
      .setTitle('❌ Error')
      .setDescription('An error occurred while fetching message statistics.')
      .setColor(0xFF6B6B)
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

async function showUserStats(interaction: ChatInputCommandInteraction, user: User): Promise<void> {
  const userStats = dataStorage.getUserStats(user.id);
  const userData = dataStorage.getUser(user.id);

  const embed = new EmbedBuilder()
    .setTitle(`📊 Message Statistics: ${user.username}`)
    .setThumbnail(user.displayAvatarURL())
    .setColor(0x00D4FF)
    .setTimestamp();

  if (!userStats) {
    embed.setDescription('This user has no recorded message activity.');
    embed.setColor(0xFFA500);
  } else {
    let description = `**Total Messages:** ${userStats.messageCount.toLocaleString()}\n`;
    description += `**Last Active:** <t:${Math.floor(userStats.lastMessageAt / 1000)}:R>\n`;

    const topUsers = dataStorage.getTopMessagers(1000);
    const userRank = topUsers.findIndex(stats => stats.userId === user.id) + 1;
    
    if (userRank > 0) {
      description += `**Rank:** #${userRank} of ${topUsers.length}`;
    }

    embed.setDescription(description);

    if (userData?.robloxUsername) {
      embed.addFields({
        name: '🎮 Roblox Account',
        value: `[${userData.robloxUsername}](https://www.roblox.com/users/${userData.robloxId}/profile)`,
        inline: true
      });
    }
  }

  try {
    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error sending user stats:', error);
    await interaction.reply({
      content: 'Failed to fetch user statistics. Please try again later.',
      ephemeral: true
    }).catch(() => {});
  }
}

async function showLeaderboard(interaction: ChatInputCommandInteraction): Promise<void> {
  const topUsers = dataStorage.getTopMessagers(10);

  const embed = new EmbedBuilder()
    .setTitle('📈 Message Leaderboard')
    .setDescription('Top 10 most active users in this server')
    .setColor(0x00D4FF)
    .setTimestamp();

  if (topUsers.length === 0) {
    embed.setDescription('No message activity recorded yet.');
    embed.setColor(0xFFA500);
  } else {
    let leaderboardText = '';
    const medals = ['🥇', '🥈', '🥉'];

    for (let i = 0; i < topUsers.length; i++) {
      const userStats = topUsers[i];
      let displayName = `User ID: ${userStats.userId}`;
      let robloxInfo = '';

      try {
        const discordUser = await interaction.client.users.fetch(userStats.userId);
        displayName = discordUser.username;
      } catch (error) {
      }

      const userData = dataStorage.getUser(userStats.userId);
      if (userData?.robloxUsername) {
        robloxInfo = ` (${userData.robloxUsername})`;
      }

      const medal = i < 3 ? medals[i] : `**${i + 1}.**`;
      const messageCount = userStats.messageCount.toLocaleString();
      
      leaderboardText += `${medal} ${displayName}${robloxInfo} - ${messageCount} messages\n`;
    }

    embed.addFields({
      name: '🏆 Top Contributors',
      value: leaderboardText,
      inline: false
    });

    const totalMessages = topUsers.reduce((sum, user) => sum + user.messageCount, 0);
    embed.addFields({
      name: '📊 Server Stats',
      value: `**Total Messages Tracked:** ${totalMessages.toLocaleString()}\n**Active Users:** ${topUsers.length}`,
      inline: true
    });

    const requesterId = interaction.user.id;
    const requesterRank = topUsers.findIndex(stats => stats.userId === requesterId) + 1;
    
    if (requesterRank === 0) {
      const requesterStats = dataStorage.getUserStats(requesterId);
      if (requesterStats) {
        const allUsers = dataStorage.getTopMessagers(1000);
        const actualRank = allUsers.findIndex(stats => stats.userId === requesterId) + 1;
        
        embed.addFields({
          name: '📍 Your Rank',
          value: `#${actualRank} with ${requesterStats.messageCount.toLocaleString()} messages`,
          inline: true
        });
      }
    } else if (requesterRank > 0) {
      embed.addFields({
        name: '📍 Your Rank',
        value: `#${requesterRank} - You're in the top 10! 🎉`,
        inline: true
      });
    }
  }

  embed.setFooter({
    text: 'Message tracking started when bot was added to server',
    iconURL: interaction.client.user?.displayAvatarURL()
  });

  try {
    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error sending leaderboard:', error);
    await interaction.reply({
      content: 'Failed to fetch message leaderboard. Please try again later.',
      ephemeral: true
    }).catch(() => {});
  }
}

export default { data, execute };