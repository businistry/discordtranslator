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

// Fetch message attachments as Discord AttachmentBuilder[] for re-sending (media is not translated)
async function getAttachmentBuilders(attachments) {
  if (!attachments?.size) return [];
  const builders = [];
  for (const att of attachments.values()) {
    try {
      const res = await fetch(att.url);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      builders.push(new AttachmentBuilder(buf, { name: att.name ?? "file" }));
    } catch (err) {
      console.error("Failed to fetch attachment:", att.name, err);
    }
  }
  return builders;
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
    const hasText = content && content.trim();
    const hasAttachments = message.attachments?.size > 0;
    if (!hasText && !hasAttachments) return;

    const info = channelIdToGroup[channel.id];
    if (!info) return; // not a translation channel

    const { groupName, lang: sourceLang } = info;
    const channels = CHANNEL_GROUPS[groupName];
    const targetLangs = ["en", "es", "pt", "ko"].filter((l) => l !== sourceLang);

    const username = `**${message.member?.displayName || message.author.username}:**`;

    // Fetch attachments once and forward as-is to all channels (no translation for media)
    const files = await getAttachmentBuilders(message.attachments);

    for (const targetLang of targetLangs) {
      const channelId = channels[targetLang];
      if (channelId === channel.id) continue; // never post back to source channel
      const targetChannel = await client.channels.fetch(channelId);
      if (!targetChannel?.isTextBased()) continue;

      const payload = { files: files.length ? files : undefined };
      if (hasText) {
        const translated = await translateText(content.trim(), targetLang);
        payload.content = `${username} ${translated}`;
      } else {
        payload.content = username; // media-only: just the username
      }

      await targetChannel.send(payload);
    }
  } catch (err) {
    console.error("Error handling message:", err);
  }
});

client.login(process.env.DISCORD_TOKEN);
