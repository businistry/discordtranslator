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

// Map channel ID → { groupName, lang } for fast lookup
const channelIdToGroup = {};
for (const [groupName, channels] of Object.entries(CHANNEL_GROUPS)) {
  for (const [lang, channelId] of Object.entries(channels)) {
    channelIdToGroup[channelId] = { groupName, lang };
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
  for (const [groupName, channels] of Object.entries(CHANNEL_GROUPS)) {
    console.log(`➡ ${groupName}: EN=${channels.en} ES=${channels.es} PT=${channels.pt} KO=${channels.ko}`);
  }
});

client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;

    const { channel, content } = message;
    if (!content || !content.trim()) return;

    const info = channelIdToGroup[channel.id];
    if (!info) return; // not a translation channel

    const { groupName, lang: sourceLang } = info;
    const channels = CHANNEL_GROUPS[groupName];
    const targetLangs = ["en", "es", "pt", "ko"].filter((l) => l !== sourceLang);

    const username = `**${message.member?.displayName || message.author.username}:**`;

    for (const targetLang of targetLangs) {
      const channelId = channels[targetLang];
      const targetChannel = await client.channels.fetch(channelId);
      if (!targetChannel?.isTextBased()) continue;
      const translated = await translateText(content, targetLang);
      await targetChannel.send(`${username} ${translated}`);
    }
  } catch (err) {
    console.error("Error handling message:", err);
  }
});

client.login(process.env.DISCORD_TOKEN);
