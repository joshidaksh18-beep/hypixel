const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const axios = require('axios').default;

const client = new Client({ 
  intents: 3276799   // or better: use specific intents only (see note below)
});

// ────────────────────────────────────────────────
//          Read secrets from environment variables
// ────────────────────────────────────────────────
const TOKEN       = process.env.DISCORD_TOKEN;
const HYPIXEL_KEY = process.env.HYPIXEL_API_KEY;
const MEMBER_ROLE = process.env.MEMBER_ROLE_ID;   // renamed for clarity

// Optional: crash early if critical values are missing
if (!TOKEN) {
  console.error("DISCORD_TOKEN is missing in environment variables!");
  process.exit(1);
}
if (!HYPIXEL_KEY) {
  console.error("HYPIXEL_API_KEY is missing in environment variables!");
  process.exit(1);
}
if (!MEMBER_ROLE) {
  console.warn("MEMBER_ROLE_ID is not set → role features will not work");
}

client.once('ready', () => {
  console.log(`Ready! Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (commandName === 'ping') {
    await interaction.reply('Pong!');
    return;
  }

  if (commandName === 'verify') {
    const username = interaction.options.getString('username'); // safer than .value
    if (!username) {
      return interaction.reply({ content: "Missing username!", ephemeral: true });
    }

    console.log(`Verifying: ${username}`);

    try {
      // Step 1: Get UUID from username
      const mojangRes = await axios.get(`https://api.mojang.com/users/profiles/minecraft/${username}`);
      const uuid = mojangRes.data.id;

      // Step 2: Get Hypixel player data
      const hypixelRes = await axios.get(`https://api.hypixel.net/player?key=${HYPIXEL_KEY}&uuid=${uuid}`);

      const player = hypixelRes.data.player;

      // Helper to reply "no Discord linked"
      const replyNoLink = async () => {
        const embed = new EmbedBuilder()
          .setColor('#fc3a3a')
          .setTitle('Verification unsuccessful!')
          .setDescription(
            'Your Discord and Minecraft accounts are not linked properly!\n' +
            'Please link your Discord in your Hypixel social settings.'
          );
        await interaction.reply({ embeds: [embed], ephemeral: true });
      };

      // Check if Discord is linked
      if (!player?.socialMedia?.links?.DISCORD) {
        return replyNoLink();
      }

      const linkedDiscord = player.socialMedia.links.DISCORD;

      if (interaction.user.tag !== linkedDiscord) {
        const embed = new EmbedBuilder()
          .setColor('#fc3a3a')
          .setTitle('Verification unsuccessful!')
          .setDescription(
            `Your linked Discord is **${linkedDiscord}**, ` +
            `but you're using **${interaction.user.tag}**.\n` +
            'Please update your Hypixel Discord link.'
          );
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      // ── Success path ────────────────────────────────────────
      const role = interaction.guild.roles.cache.get(MEMBER_ROLE);

      if (!role) {
        console.warn(`Role ID ${MEMBER_ROLE} not found in guild`);
      }

      const successEmbed = new EmbedBuilder()
        .setColor('#3afc6e')
        .setTitle('Verified!')
        .setDescription('Your accounts are linked correctly!');

      let replyContent = { embeds: [successEmbed], ephemeral: true };

      // Try to add role
      if (role) {
        await interaction.member.roles.add(role);
        successEmbed.setDescription(successEmbed.data.description + '\nRole added.');
      }

      // Try to change nickname
      try {
        await interaction.member.setNickname(username);
        successEmbed.setDescription(successEmbed.data.description + '\nNickname updated.');
      } catch (err) {
        successEmbed
          .setColor('Blue')
          .setTitle('Partially verified!')
          .setDescription('Accounts linked, but nickname could not be changed (missing permissions?).');
      }

      await interaction.reply(replyContent);

    } catch (error) {
      console.error('Verification error:', error?.response?.data || error.message);

      let msg = 'Something went wrong during verification.';
      if (error.response?.status === 404) {
        msg = `Minecraft player **${username}** not found.`;
      } else if (error.response?.status === 429) {
        msg = 'Rate limited — try again later.';
      }

      const embed = new EmbedBuilder()
        .setColor('#fc3a3a')
        .setTitle('Error')
        .setDescription(msg);

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
});

client.login(TOKEN);
