import axios from "axios";
import { GoogleGenAI } from "@google/genai";

let geminiClient = null;

function limitReply(text, maxChars) {
  return String(text || "🤖 Não consegui gerar a resposta agora.").trim().slice(0, maxChars);
}

function getGeminiClient(apiKey) {
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey });
  }
  return geminiClient;
}

function buildSystemPrompt(senderName, botName, memorySummary) {
  return [
    `Você é ${botName}, um assistente dentro de um bot de WhatsApp.`,
    "Responda em português do Brasil.",
    "Seja direto, útil, simpático e organizado.",
    "Evite respostas enormes; o formato é WhatsApp.",
    senderName ? `Nome do usuário: ${senderName}.` : "",
    memorySummary ? `Contexto recente:\n${memorySummary}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function buildMessages({ userMessage, senderName, botName, history }) {
  const memorySummary = history
    .map((item) => `${item.role === "user" ? "Usuário" : "Bot"}: ${item.content}`)
    .join("\n");

  const system = buildSystemPrompt(senderName, botName, memorySummary);

  return {
    system,
    chatMessages: [
      { role: "system", content: system },
      ...history.map((item) => ({
        role: item.role === "model" ? "assistant" : item.role,
        content: item.content
      })),
      { role: "user", content: userMessage }
    ]
  };
}

export async function generateGeminiReply({ apiKey, model, userMessage, senderName, botName, history, maxChars }) {
  const client = getGeminiClient(apiKey);
  const { system } = buildMessages({ userMessage, senderName, botName, history });

  const response = await client.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: `${system}\n\nMensagem atual do usuário: ${userMessage}` }] }]
  });

  return limitReply(response?.text, maxChars);
}

export async function generateOpenRouterReply({
  apiKey,
  baseUrl,
  model,
  userMessage,
  senderName,
  siteUrl,
  appName,
  botName,
  history,
  maxChars
}) {
  const { chatMessages } = buildMessages({ userMessage, senderName, botName, history });

  const response = await axios.post(
    `${baseUrl.replace(/\/$/, "")}/chat/completions`,
    {
      model,
      messages: chatMessages,
      temperature: 0.7
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(siteUrl ? { "HTTP-Referer": siteUrl } : {}),
        ...(appName ? { "X-Title": appName } : {})
      },
      timeout: 40000
    }
  );

  return limitReply(response.data?.choices?.[0]?.message?.content, maxChars);
}

export async function generateReplyWithFallback({ strategy, config, userMessage, senderName, history }) {
  const attempts = [];

  async function runGemini(label, model) {
    if (!config.geminiApiKey) throw new Error("GEMINI_API_KEY não configurada.");
    const text = await generateGeminiReply({
      apiKey: config.geminiApiKey,
      model,
      userMessage,
      senderName,
      botName: config.botName,
      history,
      maxChars: config.maxReplyChars
    });
    return { provider: label, model, text };
  }

  async function runDeepSeek() {
    if (!config.openRouterApiKey) throw new Error("OPENROUTER_API_KEY não configurada.");
    const text = await generateOpenRouterReply({
      apiKey: config.openRouterApiKey,
      baseUrl: config.openRouterBaseUrl,
      model: config.openRouterModel,
      userMessage,
      senderName,
      siteUrl: config.openRouterSiteUrl,
      appName: config.openRouterAppName,
      botName: config.botName,
      history,
      maxChars: config.maxReplyChars
    });
    return { provider: "deepseek", model: config.openRouterModel, text };
  }

  const chain = [];

  if (strategy === "gemini") {
    chain.push(() => runGemini("gemini-primary", config.gemini1Model));
    chain.push(() => runGemini("gemini-fallback", config.gemini2Model));
  } else if (strategy === "deepseek") {
    chain.push(() => runDeepSeek());
  } else {
    chain.push(() => runGemini("gemini-primary", config.gemini1Model));
    chain.push(() => runGemini("gemini-fallback", config.gemini2Model));
    chain.push(() => runDeepSeek());
  }

  for (const task of chain) {
    try {
      return await task();
    } catch (error) {
      attempts.push(error.message || "Erro desconhecido");
    }
  }

  throw new Error(`Falha em todos os providers: ${attempts.join(" | ")}`);
}
