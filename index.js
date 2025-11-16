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
const CHANNEL_PT = "1439099425287962695"; // Portuguese side
const CHANNEL_KO = "1439099375375614063"; // Korean side

const DEEPL_API_KEY = process.env.DEEPL_API_KEY;

// 🔁 Translation via DeepL API
async function translateText(text, targetLang) {
  try {
    // DeepL language codes: EN, ES, PT-BR, KO
    let deeplTargetLang;
    if (targetLang === "en") {
      deeplTargetLang = "EN";
    } else if (targetLang === "es") {
      deeplTargetLang = "ES";
    } else if (targetLang === "pt") {
      deeplTargetLang = "PT-BR";
    } else if (targetLang === "ko") {
      deeplTargetLang = "KO";
    } else {
      deeplTargetLang = targetLang.toUpperCase();
    }

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
  console.log(`➡ Portuguese channel: ${CHANNEL_PT}`);
  console.log(`➡ Korean channel: ${CHANNEL_KO}`);
});

client.on("messageCreate", async (message) => {
  try {
    // Ignore all bot messages (including itself) to avoid loops
    if (message.author.bot) return;

    const { channel, content } = message;
    if (!content || !content.trim()) return;

    const username = `**${message.member?.displayName || message.author.username}:**`;

    // Message from ENGLISH channel
    if (channel.id === CHANNEL_EN) {
      // Translate to Spanish
      const esChannel = await client.channels.fetch(CHANNEL_ES);
      if (esChannel && esChannel.isTextBased()) {
        const esTranslated = await translateText(content, "es");
        await esChannel.send(`${username} ${esTranslated}`);
      }
      
      // Translate to Portuguese
      const ptChannel = await client.channels.fetch(CHANNEL_PT);
      if (ptChannel && ptChannel.isTextBased()) {
        const ptTranslated = await translateText(content, "pt");
        await ptChannel.send(`${username} ${ptTranslated}`);
      }
      
      // Translate to Korean
      const koChannel = await client.channels.fetch(CHANNEL_KO);
      if (koChannel && koChannel.isTextBased()) {
        const koTranslated = await translateText(content, "ko");
        await koChannel.send(`${username} ${koTranslated}`);
      }
    }

    // Message from SPANISH channel
    else if (channel.id === CHANNEL_ES) {
      // Translate to English
      const enChannel = await client.channels.fetch(CHANNEL_EN);
      if (enChannel && enChannel.isTextBased()) {
        const enTranslated = await translateText(content, "en");
        await enChannel.send(`${username} ${enTranslated}`);
      }
      
      // Translate to Portuguese
      const ptChannel = await client.channels.fetch(CHANNEL_PT);
      if (ptChannel && ptChannel.isTextBased()) {
        const ptTranslated = await translateText(content, "pt");
        await ptChannel.send(`${username} ${ptTranslated}`);
      }
      
      // Translate to Korean
      const koChannel = await client.channels.fetch(CHANNEL_KO);
      if (koChannel && koChannel.isTextBased()) {
        const koTranslated = await translateText(content, "ko");
        await koChannel.send(`${username} ${koTranslated}`);
      }
    }

    // Message from PORTUGUESE channel
    else if (channel.id === CHANNEL_PT) {
      // Translate to English
      const enChannel = await client.channels.fetch(CHANNEL_EN);
      if (enChannel && enChannel.isTextBased()) {
        const enTranslated = await translateText(content, "en");
        await enChannel.send(`${username} ${enTranslated}`);
      }
      
      // Translate to Spanish
      const esChannel = await client.channels.fetch(CHANNEL_ES);
      if (esChannel && esChannel.isTextBased()) {
        const esTranslated = await translateText(content, "es");
        await esChannel.send(`${username} ${esTranslated}`);
      }
      
      // Translate to Korean
      const koChannel = await client.channels.fetch(CHANNEL_KO);
      if (koChannel && koChannel.isTextBased()) {
        const koTranslated = await translateText(content, "ko");
        await koChannel.send(`${username} ${koTranslated}`);
      }
    }

    // Message from KOREAN channel
    else if (channel.id === CHANNEL_KO) {
      // Translate to English
      const enChannel = await client.channels.fetch(CHANNEL_EN);
      if (enChannel && enChannel.isTextBased()) {
        const enTranslated = await translateText(content, "en");
        await enChannel.send(`${username} ${enTranslated}`);
      }
      
      // Translate to Spanish
      const esChannel = await client.channels.fetch(CHANNEL_ES);
      if (esChannel && esChannel.isTextBased()) {
        const esTranslated = await translateText(content, "es");
        await esChannel.send(`${username} ${esTranslated}`);
      }
      
      // Translate to Portuguese
      const ptChannel = await client.channels.fetch(CHANNEL_PT);
      if (ptChannel && ptChannel.isTextBased()) {
        const ptTranslated = await translateText(content, "pt");
        await ptChannel.send(`${username} ${ptTranslated}`);
      }
    }

    // ignore all other channels
  } catch (err) {
    console.error("Error handling message:", err);
  }
});

client.login(process.env.DISCORD_TOKEN);
