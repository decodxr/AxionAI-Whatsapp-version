import express from "express";
import { config, validateConfig } from "./config.js";
import { resolveCommand } from "./commands.js";
import { checkSpam, markWarned } from "./antiSpam.js";
import {
  sendTextMessage,
  uploadMediaBuffer,
  sendAudioMessage,
  extractIncomingMessage
} from "./whatsapp.js";
import { generateReplyWithFallback } from "./aiProviders.js";
import { synthesizeOggFromText } from "./tts.js";
import {
  getUserState,
  getEffectiveReplyMode,
  setUserReplyMode,
  setGlobalReplyMode,
  appendConversationTurn,
  getConversationHistory,
  clearConversationHistory,
  countUsers,
  getGlobalReplyMode
} from "./store.js";

const app = express();
app.use(express.json({ limit: "8mb" }));

app.get("/", (_req, res) => {
  res.status(200).json({
    ok: true,
    bot: config.botName,
    status: "online"
  });
});

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === config.verifyToken) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

function isOwner(number) {
  return Boolean(config.ownerNumber) && String(number) === String(config.ownerNumber);
}

function mapModeLabel(mode) {
  if (mode === "audio") return "audio";
  return "text";
}

async function sendSmartReply(to, text, mode) {
  if (mode === "audio") {
    try {
      if (!config.geminiApiKey) throw new Error("GEMINI_API_KEY ausente para TTS");
      const audioBuffer = await synthesizeOggFromText({
        apiKey: config.geminiApiKey,
        model: config.geminiTtsModel,
        voiceName: config.geminiTtsVoice,
        text
      });
      const mediaId = await uploadMediaBuffer({
        graphApiVersion: config.graphApiVersion,
        phoneNumberId: config.phoneNumberId,
        token: config.whatsappToken,
        buffer: audioBuffer,
        filename: "reply.ogg",
        contentType: "audio/ogg"
      });
      await sendAudioMessage({
        graphApiVersion: config.graphApiVersion,
        phoneNumberId: config.phoneNumberId,
        token: config.whatsappToken,
        to,
        mediaId
      });
      return;
    } catch (error) {
      console.error("Erro no áudio, caindo para texto:", error.message);
      await sendTextMessage({
        graphApiVersion: config.graphApiVersion,
        phoneNumberId: config.phoneNumberId,
        token: config.whatsappToken,
        to,
        body: `🎧 Não consegui enviar em áudio agora, então vou mandar em texto:\n\n${text}`
      });
      return;
    }
  }

  await sendTextMessage({
    graphApiVersion: config.graphApiVersion,
    phoneNumberId: config.phoneNumberId,
    token: config.whatsappToken,
    to,
    body: text
  });
}

async function executeStructuredAction(action, incoming) {
  if (typeof action === "string" || action === null) return action;

  if (action.type === "set-user-mode") {
    if (action.mode === "auto") {
      setUserReplyMode(incoming.from, null);
      return `✅ Seu modo foi redefinido para *auto*. Agora você segue o modo global do bot.`;
    }
    setUserReplyMode(incoming.from, action.mode);
    return `✅ Seu modo de resposta agora é *${mapModeLabel(action.mode)}*.`;
  }

  if (action.type === "clear-user-memory") {
    clearConversationHistory(incoming.from);
    return "🧹 Sua memória recente foi apagada.";
  }

  if (action.type === "set-global-mode") {
    setGlobalReplyMode(action.mode);
    return `🌍 Modo global alterado para *${mapModeLabel(action.mode)}*.`;
  }

  if (action.type === "owner-stats") {
    return [
      "📊 *Estatísticas rápidas*",
      `• Usuários com registro: *${countUsers()}*`,
      `• Modo global: *${getGlobalReplyMode(config.defaultReplyMode)}*`,
      `• Memória por usuário: até *${config.memoryMaxTurns}* turnos`
    ].join("\n");
  }

  if (action.type === "clear-all-memory") {
    return "⚠️ Esse pacote deixa o comando preparado, mas por segurança a limpeza total é manual: apague o arquivo *data/store.json* ou substitua o conteúdo. Assim você evita apagar tudo sem querer.";
  }

  return null;
}

app.post("/webhook", async (req, res) => {
  try {
    const incoming = extractIncomingMessage(req.body);
    if (!incoming) return res.sendStatus(200);

    if (incoming.isGroup && !config.allowGroups) {
      return res.sendStatus(200);
    }

    const spam = checkSpam({
      userId: incoming.from,
      windowMs: config.spamWindowMs,
      maxMessages: config.spamMaxMessages,
      cooldownMs: config.spamCooldownMs
    });

    if (spam.blocked) {
      if (spam.shouldWarn) {
        markWarned(incoming.from);
        await sendTextMessage({
          graphApiVersion: config.graphApiVersion,
          phoneNumberId: config.phoneNumberId,
          token: config.whatsappToken,
          to: incoming.from,
          body: "⏳ Você enviou mensagens rápido demais. Espera um pouco e tenta de novo."
        });
      }
      return res.sendStatus(200);
    }

    const userState = getUserState(incoming.from);
    const globalReplyMode = getGlobalReplyMode(config.defaultReplyMode);
    const replyMode = getEffectiveReplyMode(incoming.from, config.defaultReplyMode);
    const history = getConversationHistory(incoming.from, config.memoryMaxTurns);
    const owner = isOwner(incoming.from);

    if (incoming.type !== "text") {
      await sendTextMessage({
        graphApiVersion: config.graphApiVersion,
        phoneNumberId: config.phoneNumberId,
        token: config.whatsappToken,
        to: incoming.from,
        body: "📩 No momento eu processo mensagens de texto. Se quiser falar com a IA, use um comando como *!ia sua pergunta*."
      });
      return res.sendStatus(200);
    }

    const rawText = incoming.text.trim();

    if (!rawText.startsWith("!")) {
      await sendTextMessage({
        graphApiVersion: config.graphApiVersion,
        phoneNumberId: config.phoneNumberId,
        token: config.whatsappToken,
        to: incoming.from,
        body: [
          `👋 Oi, ${incoming.profileName || "tudo bem"}!`,
          `Eu sou o *${config.botName}* e uso comandos com *!*.`,
          "Digite *!menu* para começar."
        ].join("\n")
      });
      return res.sendStatus(200);
    }

    const [command, ...args] = rawText.split(/\s+/);
    const ctx = {
      command,
      args,
      botName: config.botName,
      isOwner: owner,
      gemini1Model: config.gemini1Model,
      gemini2Model: config.gemini2Model,
      openRouterModel: config.openRouterModel,
      globalReplyMode,
      savedReplyMode: userState.replyMode,
      userReplyMode: replyMode,
      historyLength: history.length
    };

    let reply = resolveCommand(ctx);
    reply = await executeStructuredAction(reply, incoming);

    const lowerCommand = command.toLowerCase();
    const isAiCommand = ["!ia", "!gemini", "!deepseek"].includes(lowerCommand);

    if (reply === null && isAiCommand) {
      const prompt = args.join(" ").trim();
      appendConversationTurn(incoming.from, "user", prompt, config.memoryMaxTurns);
      const freshHistory = getConversationHistory(incoming.from, config.memoryMaxTurns);

      const strategy = lowerCommand === "!gemini" ? "gemini" : lowerCommand === "!deepseek" ? "deepseek" : "auto";

      try {
        const result = await generateReplyWithFallback({
          strategy,
          config,
          userMessage: prompt,
          senderName: incoming.profileName,
          history: freshHistory.slice(0, -1)
        });

        const finalText = strategy === "auto"
          ? `🧠 *Resposta (${result.provider})*\n\n${result.text}`
          : result.text;

        appendConversationTurn(incoming.from, "model", finalText, config.memoryMaxTurns);
        await sendSmartReply(incoming.from, finalText, replyMode);
      } catch (error) {
        console.error("Erro na IA:", error.message);
        await sendTextMessage({
          graphApiVersion: config.graphApiVersion,
          phoneNumberId: config.phoneNumberId,
          token: config.whatsappToken,
          to: incoming.from,
          body: "❌ Não consegui responder agora. Verifique suas chaves do Gemini/OpenRouter e tente novamente."
        });
      }

      return res.sendStatus(200);
    }

    if (typeof reply === "string" && reply) {
      await sendSmartReply(incoming.from, reply, replyMode);
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error("Erro no webhook:", error.response?.data || error.message);
    return res.sendStatus(500);
  }
});

const missing = validateConfig();
if (missing.length > 0) {
  console.warn(`⚠️ Variáveis ausentes: ${missing.join(", ")}`);
}

app.listen(config.port, () => {
  console.log(`🚀 ${config.botName} rodando na porta ${config.port}`);
});
