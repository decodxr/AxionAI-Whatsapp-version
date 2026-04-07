import dotenv from "dotenv";

dotenv.config();

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["true", "1", "yes", "sim", "on"].includes(String(value).toLowerCase());
}

function parseNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  port: parseNumber(process.env.PORT, 3000),
  verifyToken: process.env.VERIFY_TOKEN || "troque-este-token",
  whatsappToken: process.env.WHATSAPP_TOKEN || "",
  phoneNumberId: process.env.PHONE_NUMBER_ID || "",
  graphApiVersion: process.env.GRAPH_API_VERSION || "v23.0",

  botName: process.env.BOT_NAME || "WhatsApp Bot",
  ownerName: process.env.OWNER_NAME || "Dono(a)",
  ownerNumber: String(process.env.BOT_OWNER_NUMBER || "").replace(/\D/g, ""),
  allowGroups: parseBoolean(process.env.ALLOW_GROUPS, false),

  enableAiReply: parseBoolean(process.env.ENABLE_AI_REPLY, true),
  defaultReplyMode: process.env.DEFAULT_REPLY_MODE || "text",

  geminiApiKey: process.env.GEMINI_API_KEY || "",
  gemini1Model: process.env.GEMINI_1_MODEL || "gemini-2.5-flash",
  gemini2Model: process.env.GEMINI_2_MODEL || "gemini-2.5-flash",
  geminiTtsModel: process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts",
  geminiTtsVoice: process.env.GEMINI_TTS_VOICE || "Kore",

  openRouterApiKey: process.env.OPENROUTER_API_KEY || "",
  openRouterBaseUrl: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
  openRouterModel: process.env.OPENROUTER_MODEL || "deepseek/deepseek-chat",
  openRouterSiteUrl: process.env.OPENROUTER_SITE_URL || "",
  openRouterAppName: process.env.OPENROUTER_APP_NAME || "WhatsApp Bot",

  memoryMaxTurns: parseNumber(process.env.MEMORY_MAX_TURNS, 8),
  spamWindowMs: parseNumber(process.env.SPAM_WINDOW_MS, 20000),
  spamMaxMessages: parseNumber(process.env.SPAM_MAX_MESSAGES, 6),
  spamCooldownMs: parseNumber(process.env.SPAM_COOLDOWN_MS, 45000),
  maxReplyChars: parseNumber(process.env.MAX_REPLY_CHARS, 3500)
};

export function validateConfig() {
  const missing = [];

  if (!config.verifyToken) missing.push("VERIFY_TOKEN");
  if (!config.whatsappToken) missing.push("WHATSAPP_TOKEN");
  if (!config.phoneNumberId) missing.push("PHONE_NUMBER_ID");

  return missing;
}
