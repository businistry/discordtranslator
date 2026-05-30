require("dotenv").config();
const { Client, GatewayIntentBits, AttachmentBuilder } = require("discord.js");

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
};

const LANGS = ["en", "es", "pt", "ko"];
const monitoredChannels = new Set();
for (const channels of Object.values(CHANNEL_GROUPS)) {
  for (const channelId of Object.values(channels)) {
    monitoredChannels.add(channelId);
  }
}

const DEEPL_API_KEY = process.env.DEEPL_API_KEY;

function findSourceChannel(channelId) {
  for (const [groupName, channels] of Object.entries(CHANNEL_GROUPS)) {
    for (const [lang, configuredChannelId] of Object.entries(channels)) {
      if (configuredChannelId === channelId) {
        return { groupName, lang, channels };
      }
    }
  }

  return null;
}

function getImageAttachments(message) {
  return [...message.attachments.values()].filter((attachment) => {
    return attachment.contentType?.startsWith("image/");
  });
}

async function downloadAttachment(attachment) {
  const response = await fetch(attachment.url);
  if (!response.ok) {
    throw new Error(`Failed to download ${attachment.name}: ${response.status}`);
  }

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    name: attachment.name || "image",
  };
}

function buildAttachmentFiles(downloadedImages) {
  return downloadedImages.map((image) => {
    return new AttachmentBuilder(image.buffer, { name: image.name });
  });
}

function getAuthorName(message) {
  return message.member?.displayName || message.author.globalName || message.author.username;
}

async function translateText(text, targetLang) {
  try {
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
        text,
        target_lang: deeplTargetLang,
      }),
    });

    if (!response.ok) {
      console.error("DeepL API error:", await response.text());
      return { text, lang: null };
    }

    const data = await response.json();
    const translation = data.translations?.[0];
    const translatedText = translation?.text?.trim();
    const detectedSourceLang = translation?.detected_source_language;

    return {
      text: translatedText || text,
      lang: detectedSourceLang || null,
    };
  } catch (err) {
    console.error("Translation failed:", err);
    return { text, lang: null };
  }
}

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
  for (const [groupName, channels] of Object.entries(CHANNEL_GROUPS)) {
    console.log(`${groupName}: EN=${channels.en} ES=${channels.es} PT=${channels.pt} KO=${channels.ko}`);
  }
});

client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;
    if (!monitoredChannels.has(message.channel.id)) return;

    const source = findSourceChannel(message.channel.id);
    if (!source) return;

    const text = message.content?.trim() || "";
    const imageAttachments = getImageAttachments(message);
    if (!text && imageAttachments.length === 0) return;

    const downloadedImages = await Promise.all(
      imageAttachments.map((attachment) => downloadAttachment(attachment))
    );

    const targetLangs = LANGS.filter((lang) => lang !== source.lang);
    const translations = await Promise.all(
      targetLangs.map(async (targetLang) => {
        const translated = text ? await translateText(text, targetLang) : { text: "" };
        return {
          lang: targetLang,
          text: translated.text,
          channelId: source.channels[targetLang],
        };
      })
    );

    for (const translation of translations) {
      const targetChannel = await client.channels.fetch(translation.channelId);
      if (!targetChannel?.isTextBased()) {
        console.error(`Target channel is not text-based: ${translation.channelId}`);
        continue;
      }

      const authorName = getAuthorName(message);
      const content = translation.text ? `**${authorName}:** ${translation.text}` : `**${authorName}:**`;
      const files = buildAttachmentFiles(downloadedImages);

      await targetChannel.send({
        content,
        files,
      });
    }
  } catch (err) {
    console.error("Error handling message:", err);
  }
});

client.login(process.env.DISCORD_TOKEN);
