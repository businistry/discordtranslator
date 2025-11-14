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

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// 🔁 Translation via OpenRouter: google/gemma-3-27b-it:free
async function translateText(text, targetLang) {
  try {
    const systemPrompt =
      targetLang === "es"
        ? "You are a professional translator. Translate all user messages from English into natural, fluent Spanish, preserving tone and intent. Return ONLY the translated Spanish text, no extra words."
        : "You are a professional translator. Translate all user messages from Spanish into natural, fluent English, preserving tone and intent. Return ONLY the translated English text, no extra words.";

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://1642-translator.bot", // any URL/string is fine
        "X-Title": "1642 Translator Bot"
      },
      body: JSON.stringify({
        model: "google/gemma-3-27b-it:free",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text }
        ],
        temperature: 0.2
      })
    });

    if (!response.ok) {
      console.error("OpenRouter error:", await response.text());
      return text; // fallback to original text on error
    }

    const data = await response.json();
    const translated = data.choices?.[0]?.message?.content?.trim();

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
