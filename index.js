require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  AttachmentBuilder,
  PermissionFlagsBits,
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const CHANNEL_GROUPS = {
  roundTable: {
    en: "1386112174635876485",
    es: "1438688020818694174",
    pt: "1439099425287962695",
    ko: "1439099375375614063",
  },
};

const LANGUAGE_CONFIG = {
  en: {
    label: "English",
    deeplTargetLang: "EN",
    deeplSourceLang: "EN",
    geminiLabel: "English",
  },
  es: {
    label: "Spanish",
    deeplTargetLang: "ES",
    deeplSourceLang: "ES",
    geminiLabel: "Spanish",
  },
  pt: {
    label: "Portuguese",
    deeplTargetLang: "PT-BR",
    deeplSourceLang: "PT",
    geminiLabel: "Portuguese",
  },
  ko: {
    label: "Korean",
    deeplTargetLang: "KO",
    deeplSourceLang: "KO",
    geminiLabel: "Korean",
  },
};

const TRANSLATION_PROVIDER = (process.env.TRANSLATION_PROVIDER || "deepl").toLowerCase();
const RELAY_IMAGES_ONLY = String(process.env.RELAY_IMAGES_ONLY || "false").toLowerCase() === "true";
const DEEPL_API_KEY = process.env.DEEPL_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const REQUIRED_PERMISSIONS = [
  { name: "ViewChannel", flag: PermissionFlagsBits.ViewChannel },
  { name: "SendMessages", flag: PermissionFlagsBits.SendMessages },
  { name: "ReadMessageHistory", flag: PermissionFlagsBits.ReadMessageHistory },
  { name: "AttachFiles", flag: PermissionFlagsBits.AttachFiles },
];

const monitoredChannels = new Set(
  Object.values(CHANNEL_GROUPS).flatMap((channels) => Object.values(channels))
);

function getConfiguredLangs(channels) {
  return Object.keys(channels).filter((lang) => LANGUAGE_CONFIG[lang]);
}

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

function getRelayAttachments(message) {
  const attachments = [...message.attachments.values()];
  if (!RELAY_IMAGES_ONLY) {
    return attachments;
  }

  return attachments.filter((attachment) => attachment.contentType?.startsWith("image/"));
}

async function downloadAttachment(attachment) {
  const response = await fetch(attachment.url);
  if (!response.ok) {
    throw new Error(`Failed to download ${attachment.name || "attachment"}: ${response.status}`);
  }

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    name: attachment.name || "attachment",
    description: attachment.description || undefined,
  };
}

function buildAttachmentFiles(downloadedAttachments) {
  return downloadedAttachments.map((attachment) => {
    return new AttachmentBuilder(attachment.buffer, {
      name: attachment.name,
      description: attachment.description,
    });
  });
}

function getAuthorName(message) {
  return message.member?.displayName || message.author.globalName || message.author.username;
}

function getMissingPermissions(channel) {
  const permissions = channel.permissionsFor(client.user);
  if (!permissions) {
    return ["unknown permissions"];
  }

  return REQUIRED_PERMISSIONS
    .filter((permission) => !permissions.has(permission.flag))
    .map((permission) => permission.name);
}

function buildRelayContent(authorName, translatedText, attachmentCount) {
  if (translatedText) {
    return `**${authorName}:** ${translatedText}`;
  }

  if (attachmentCount > 0) {
    return attachmentCount === 1
      ? `**${authorName}:** shared an attachment`
      : `**${authorName}:** shared ${attachmentCount} attachments`;
  }

  return `**${authorName}:**`;
}

function normalizeDetectedLang(langCode) {
  if (!langCode) {
    return null;
  }

  const normalized = String(langCode).trim().toUpperCase();

  if (normalized.startsWith("EN")) return "en";
  if (normalized.startsWith("ES")) return "es";
  if (normalized.startsWith("PT")) return "pt";
  if (normalized.startsWith("KO")) return "ko";

  return null;
}

async function translateWithDeepL(text, sourceLang, targetLang) {
  if (!DEEPL_API_KEY) {
    console.error("DEEPL_API_KEY is missing; using original text as fallback.");
    return { text, provider: "deepl", detectedSourceLang: null, usedFallback: true };
  }

  const sourceConfig = sourceLang ? LANGUAGE_CONFIG[sourceLang] : null;
  const targetConfig = LANGUAGE_CONFIG[targetLang];

  if (!targetConfig) {
    return { text, provider: "deepl", detectedSourceLang: null, usedFallback: true };
  }

  const body = new URLSearchParams({
    text,
    target_lang: targetConfig.deeplTargetLang,
  });

  if (sourceConfig?.deeplSourceLang) {
    body.set("source_lang", sourceConfig.deeplSourceLang);
  }

  const response = await fetch("https://api-free.deepl.com/v2/translate", {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${DEEPL_API_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepL API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const translation = data.translations?.[0];

  return {
    text: translation?.text?.trim() || text,
    provider: "deepl",
    detectedSourceLang: translation?.detected_source_language || null,
    usedFallback: false,
  };
}

async function translateWithGemini(text, sourceLang, targetLang) {
  if (!GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is missing; using original text as fallback.");
    return { text, provider: "gemini", detectedSourceLang: null, usedFallback: true };
  }

  const sourceLabel = LANGUAGE_CONFIG[sourceLang]?.geminiLabel || sourceLang;
  const targetLabel = LANGUAGE_CONFIG[targetLang]?.geminiLabel || targetLang;
  const prompt = [
    `Translate the following Discord message from ${sourceLabel} to ${targetLabel}.`,
    "Preserve tone, emojis, line breaks, and formatting.",
    "Return only the translation text.",
    `Message: ${JSON.stringify(text)}`,
  ].join("\n");

  const geminiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + encodeURIComponent(GEMINI_API_KEY);
  const response = await fetch(geminiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: {
        parts: [{ text: "You are a Discord translation bot. Output only the translated text." }],
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const translatedText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  return {
    text: translatedText || text,
    provider: "gemini",
    detectedSourceLang: null,
    usedFallback: !translatedText,
  };
}

async function translateText(text, sourceLang, targetLang) {
  try {
    if (!text) {
      return { text: "", provider: TRANSLATION_PROVIDER, detectedSourceLang: null, usedFallback: false };
    }

    if (TRANSLATION_PROVIDER === "gemini") {
      return await translateWithGemini(text, sourceLang, targetLang);
    }

    if (TRANSLATION_PROVIDER === "deepl") {
      return await translateWithDeepL(text, sourceLang, targetLang);
    }

    console.error(`Unknown TRANSLATION_PROVIDER '${TRANSLATION_PROVIDER}'; using original text as fallback.`);
    return { text, provider: TRANSLATION_PROVIDER, detectedSourceLang: null, usedFallback: true };
  } catch (err) {
    console.error(`Translation failed (${sourceLang} -> ${targetLang}):`, err);
    return { text, provider: TRANSLATION_PROVIDER, detectedSourceLang: null, usedFallback: true };
  }
}

async function detectLanguageWithGemini(text) {
  if (!GEMINI_API_KEY) {
    return null;
  }

  const geminiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + encodeURIComponent(GEMINI_API_KEY);
  const prompt = [
    "Detect the language of this Discord message.",
    "Return only one of these lowercase codes: en, es, pt, ko.",
    `Message: ${JSON.stringify(text)}`,
  ].join("\n");

  const response = await fetch(geminiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: {
        parts: [{ text: "You are a language detector. Return only en, es, pt, or ko." }],
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini language detection error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const detected = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()?.toLowerCase();

  return LANGUAGE_CONFIG[detected] ? detected : null;
}

async function detectMessageLanguage(text, fallbackLang, configuredLangs) {
  if (!text) {
    return { detectedLang: fallbackLang, probeTranslation: null };
  }

  try {
    if (TRANSLATION_PROVIDER === "gemini") {
      const detectedLang = await detectLanguageWithGemini(text);
      return {
        detectedLang: detectedLang || fallbackLang,
        probeTranslation: null,
      };
    }

    if (TRANSLATION_PROVIDER === "deepl") {
      const probeLangs = configuredLangs.filter((lang) => lang !== fallbackLang);

      for (const probeLang of probeLangs) {
        try {
          const probeTranslation = await translateWithDeepL(text, null, probeLang);
          const detectedLang = normalizeDetectedLang(probeTranslation.detectedSourceLang) || fallbackLang;

          return {
            detectedLang,
            probeTranslation: {
              lang: probeLang,
              ...probeTranslation,
            },
          };
        } catch (probeError) {
          console.error(`Language detection probe failed for ${probeLang}:`, probeError);
        }
      }
    }
  } catch (err) {
    console.error("Language detection failed:", err);
  }

  return { detectedLang: fallbackLang, probeTranslation: null };
}

async function logChannelReadiness(groupName, lang, channelId) {
  try {
    const channel = await client.channels.fetch(channelId);
    const missingPermissions = channel?.isTextBased() ? getMissingPermissions(channel) : [];

    if (!channel?.isTextBased()) {
      console.error(`${groupName}.${lang} ${channelId}: channel is not text-based or cannot be fetched`);
      return;
    }

    if (missingPermissions.length > 0) {
      console.error(`${groupName}.${lang} ${channelId}: missing permissions ${missingPermissions.join(", ")}`);
      return;
    }

    console.log(`${groupName}.${lang} ${channelId}: ready`);
  } catch (err) {
    console.error(`${groupName}.${lang} ${channelId}: failed to fetch channel`, err);
  }
}

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log(`Translation provider: ${TRANSLATION_PROVIDER}`);
  console.log(`Relay images only: ${RELAY_IMAGES_ONLY}`);

  if (TRANSLATION_PROVIDER === "deepl" && !DEEPL_API_KEY) {
    console.error("Warning: TRANSLATION_PROVIDER=deepl but DEEPL_API_KEY is missing.");
  }

  if (TRANSLATION_PROVIDER === "gemini" && !GEMINI_API_KEY) {
    console.error("Warning: TRANSLATION_PROVIDER=gemini but GEMINI_API_KEY is missing.");
  }

  for (const [groupName, channels] of Object.entries(CHANNEL_GROUPS)) {
    const summary = getConfiguredLangs(channels)
      .map((lang) => `${lang.toUpperCase()}=${channels[lang]}`)
      .join(" ");
    console.log(`${groupName}: ${summary}`);

    for (const [lang, channelId] of Object.entries(channels)) {
      await logChannelReadiness(groupName, lang, channelId);
    }
  }
});

client.on("messageCreate", async (message) => {
  try {
    if (!message.inGuild()) {
      return;
    }

    if (message.author?.id === client.user?.id || message.author?.bot || message.webhookId) {
      return;
    }

    if (!monitoredChannels.has(message.channel.id)) {
      return;
    }

    const source = findSourceChannel(message.channel.id);
    if (!source) {
      return;
    }

    const text = message.content?.trim() || "";
    const relayAttachments = getRelayAttachments(message);
    if (!text && relayAttachments.length === 0) {
      return;
    }

    const configuredLangs = getConfiguredLangs(source.channels);
    const { detectedLang, probeTranslation } = await detectMessageLanguage(text, source.lang, configuredLangs);
    const authorName = getAuthorName(message);

    console.log(
      `Relay received group=${source.groupName} sourceChannel=${source.lang} detected=${detectedLang} author=${authorName} text=${Boolean(text)} attachments=${relayAttachments.length}`
    );

    const downloadedAttachments = await Promise.all(
      relayAttachments.map((attachment) => downloadAttachment(attachment))
    );

    const targetLangs = configuredLangs.filter((lang) => !(lang === source.lang && detectedLang === source.lang));
    const translations = await Promise.all(
      targetLangs.map(async (targetLang) => {
        let translated;

        if (!text) {
          translated = { text: "", provider: TRANSLATION_PROVIDER, detectedSourceLang: null, usedFallback: false };
        } else if (targetLang === detectedLang) {
          translated = { text, provider: "original", detectedSourceLang: detectedLang, usedFallback: false };
        } else if (probeTranslation?.lang === targetLang) {
          translated = probeTranslation;
        } else {
          translated = await translateText(text, detectedLang, targetLang);
        }

        return {
          lang: targetLang,
          channelId: source.channels[targetLang],
          text: translated.text,
          provider: translated.provider,
          usedFallback: translated.usedFallback,
        };
      })
    );

    for (const translation of translations) {
      try {
        const targetChannel = await client.channels.fetch(translation.channelId);
        if (!targetChannel?.isTextBased()) {
          console.error(`Target channel is not text-based: ${translation.channelId}`);
          continue;
        }

        const missingPermissions = getMissingPermissions(targetChannel);
        if (missingPermissions.length > 0) {
          console.error(
            `Skipping ${translation.lang} ${translation.channelId}: missing permissions ${missingPermissions.join(", ")}`
          );
          continue;
        }

        const content = buildRelayContent(authorName, translation.text, downloadedAttachments.length);
        const files = buildAttachmentFiles(downloadedAttachments);

        await targetChannel.send({
          content,
          files,
        });

        console.log(
          `Relay sent group=${source.groupName} detected=${detectedLang} target=${translation.lang} provider=${translation.provider} fallback=${translation.usedFallback} attachments=${downloadedAttachments.length}`
        );
      } catch (err) {
        console.error(`Failed to send ${translation.lang} relay to ${translation.channelId}:`, err);
      }
    }
  } catch (err) {
    console.error("Error handling message:", err);
  }
});

client.login(process.env.DISCORD_TOKEN);
