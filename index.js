require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");

// Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Channel IDs (you gave these)
const CHANNEL_EN = "1386112174635876485"; // English side
const CHANNEL_ES = "1438688020818694174"; // Spanish side

const DEEPL_API_KEY = process.env.DEEPL_API_KEY;

// 🔁 Translation via DeepL API
async function translateText(text, targetLang) {
  try {
    // DeepL language codes: EN, ES, PT-BR, KO
    const deeplTargetLang = targetLang === "en" ? "EN" : targetLang === "es" ? "ES" : targetLang.toUpperCase();

    const response = await fetch(
      "https://api-free.deepl.com/v2/translate",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          auth_key: DEEPL_API_KEY,
          text: text,
          target_lang: deeplTargetLang
        })
      }
    );

    if (!response.ok) {
      console.error("DeepL API error:", await response.text());
      return text; // fallback to original text on error
    }

    const data = await response.json();
    const translated = data.translations?.[0]?.text?.trim();

    return translated || text;
  } catch (err) {
    console.error("Translation failed:", err);
    return text; // fallback to original
  }
}

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`➡ English channel: ${CHANNEL_EN}`);
  console.log(`➡ Spanish channel: ${CHANNEL_ES}`);
});

client.on("messageCreate", async (message) => {
  try {
    // Ignore all bot messages (including itself) to avoid loops
    if (message.author.bot) return;

    const { channel, content } = message;
    if (!content || !content.trim()) return;

    // EN -> ES
    if (channel.id === CHANNEL_EN) {
      const targetChannel = await client.channels.fetch(CHANNEL_ES);
      if (!targetChannel || !targetChannel.isTextBased()) return;

      const translated = await translateText(content, "es");

      await targetChannel.send(
        `**${message.member?.displayName || message.author.username}:** ${translated}`
      );
    }

    // ES -> EN
    else if (channel.id === CHANNEL_ES) {
      const targetChannel = await client.channels.fetch(CHANNEL_EN);
      if (!targetChannel || !targetChannel.isTextBased()) return;

      const translated = await translateText(content, "en");

      await targetChannel.send(
        `**${message.member?.displayName || message.author.username}:** ${translated}`
      );
    }

    // ignore all other channels
  } catch (err) {
    console.error("Error handling message:", err);
  }
});

client.login(process.env.DISCORD_TOKEN);
