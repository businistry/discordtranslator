require("dotenv").config();
const { Client, GatewayIntentBits, AttachmentBuilder } = require("discord.js");

// Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Channel groups: each group has isolated EN/ES/PT/KO channels
const CHANNEL_GROUPS = {
  roundTable: {
    en: "1386112174635876485",
    es: "1438688020818694174",
    pt: "1439099425287962695",
    ko: "1439099375375614063",
  },
  season2Planning: {
    en: "1386112271733887077",
    es: "1469916483898315025",
    pt: "1469916830079516905",
    ko: "1469916662646968474",
  },
};

// Set of monitored channel IDs
const monitoredChannels = new Set();
for (const channels of Object.values(CHANNEL_GROUPS)) {
  for (const channelId of Object.values(channels)) {
    monitoredChannels.add(channelId);
  }
}

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

    const response = await fetch("https://api-free.deepl.com/v2/translate", {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${DEEPL_API_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        text: text,
        target_lang: deeplTargetLang,
      }),
    });

    if (!response.ok) {
      console.error("DeepL API error:", await response.text());
      return { text, lang: null }; // fallback to original text on error
    }

    const data = await response.json();
    const translation = data.translations?.[0];
    const translatedText = translation?.text?.trim();
    const detectedSourceLang = translation?.detected_source_language;

    return {
      text: translatedText || text,
      lang: detectedSourceLang || null
    };
  } catch (err) {
    console.error("Translation failed:", err);
    return { text, lang: null }; // fallback to original
  }
}

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  for (const [groupName, channels] of Object.entries(CHANNEL_GROUPS)) {
    console.log(`➡ ${groupName}: EN=${channels.en} ES=${channels.es} PT=${channels.pt} KO=${channels.ko}`);
  }
});

client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;
    if (!monitoredChannels.has(message.channel.id)) return;

    const { content } = message;
    if (!content || !content.trim()) return;

    // Supported languages
    const langs = ["en", "es", "pt", "ko"];
    const langNames = {
      en: "English",
      es: "Spanish",
      pt: "Portuguese",
      ko: "Korean",
    };

    // Trigger all translations
    const results = await Promise.all(
      langs.map(async (target) => {
        const { text, lang } = await translateText(content.trim(), target);
        return { target, text, sourceLang: lang };
      })
    );

    // Identify source language (use the first valid detection)
    const detectedSource = results.find((r) => r.sourceLang)?.sourceLang;

    // Normalize source key for filtering
    let sourceKey = detectedSource ? detectedSource.toLowerCase() : null;
    if (sourceKey && sourceKey.startsWith("pt")) sourceKey = "pt";

    // Filter out the translation matching the source language
    // If source detection failed, we might show all, or handle gracefully.
    // If sourceKey is null, filter returns all (which is fine).
    const translationsToPost = results.filter((r) => r.target !== sourceKey);

    if (translationsToPost.length === 0) return;

    const lines = translationsToPost.map((t) => {
      const name = langNames[t.target] || t.target.toUpperCase();
      return `**${name}:** ${t.text}`;
    });

    await message.channel.send(lines.join("\n"));
  } catch (err) {
    console.error("Error handling message:", err);
  }
});

client.login(process.env.DISCORD_TOKEN);
