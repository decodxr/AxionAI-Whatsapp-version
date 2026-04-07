function ownerOnly(ctx) {
  if (!ctx.isOwner) {
    return "🔒 Esse comando é só para o dono do bot.";
  }
  return null;
}

export function getHelpText(botName) {
  return [
    `🤖 *${botName}*`,
    "",
    "*Comandos públicos*",
    "• !menu — abre o menu",
    "• !ajuda — mostra os comandos",
    "• !ping — teste rápido",
    "• !status — status do bot",
    "• !modelos — mostra a rota de IA",
    "• !modo texto — receber em texto",
    "• !modo audio — receber em áudio",
    "• !modo auto — usar modo salvo/global",
    "• !memoria — ver seu modo e memória",
    "• !limparmemoria — apaga sua memória",
    "• !ia sua pergunta — IA com fallback automático",
    "• !gemini sua pergunta — força Gemini",
    "• !deepseek sua pergunta — força DeepSeek",
    "",
    "*Comandos do dono*",
    "• !owner — menu admin",
    "• !setglobalmode texto|audio",
    "• !stats — estatísticas rápidas",
    "• !clearallmemory"
  ].join("\n");
}

export function resolveCommand(ctx) {
  const command = ctx.command.toLowerCase();

  if (command === "!menu" || command === "!ajuda") {
    return getHelpText(ctx.botName);
  }

  if (command === "!ping") return "🏓 Pong!";

  if (command === "!status") {
    return [
      "✅ Bot online.",
      `Modo global: *${ctx.globalReplyMode}*`,
      `Seu modo atual: *${ctx.userReplyMode}*`,
      `Fallback automático: *Gemini principal → Gemini reserva → DeepSeek*`
    ].join("\n");
  }

  if (command === "!modelos") {
    return [
      "🧠 *Rota de modelos*",
      `• Gemini principal: *${ctx.gemini1Model}*`,
      `• Gemini reserva: *${ctx.gemini2Model}*`,
      `• OpenRouter: *${ctx.openRouterModel}*`,
      "",
      "Em *!ia*, a ordem é:",
      "1. Gemini principal",
      "2. Gemini reserva",
      "3. DeepSeek via OpenRouter"
    ].join("\n");
  }

  if (command === "!modo") {
    const modeRaw = (ctx.args[0] || "").toLowerCase();
    const map = { texto: "text", text: "text", audio: "audio", auto: "auto" };
    const mode = map[modeRaw];

    if (!mode) {
      return "🎛️ Use: *!modo texto*, *!modo audio* ou *!modo auto*";
    }

    return { type: "set-user-mode", mode };
  }

  if (command === "!memoria") {
    return [
      "🧾 *Seu estado atual*",
      `• Modo salvo: *${ctx.savedReplyMode || "auto"}*`,
      `• Modo efetivo: *${ctx.userReplyMode}*`,
      `• Itens de memória recente: *${ctx.historyLength}*`
    ].join("\n");
  }

  if (command === "!limparmemoria") {
    return { type: "clear-user-memory" };
  }

  if (command === "!owner") {
    const block = ownerOnly(ctx);
    if (block) return block;
    return [
      "👑 *Menu do dono*",
      "• !setglobalmode texto|audio",
      "• !stats",
      "• !clearallmemory"
    ].join("\n");
  }

  if (command === "!setglobalmode") {
    const block = ownerOnly(ctx);
    if (block) return block;

    const modeRaw = (ctx.args[0] || "").toLowerCase();
    const map = { texto: "text", text: "text", audio: "audio" };
    const mode = map[modeRaw];

    if (!mode) {
      return "⚙️ Use: *!setglobalmode texto* ou *!setglobalmode audio*";
    }

    return { type: "set-global-mode", mode };
  }

  if (command === "!stats") {
    const block = ownerOnly(ctx);
    if (block) return block;
    return { type: "owner-stats" };
  }

  if (command === "!clearallmemory") {
    const block = ownerOnly(ctx);
    if (block) return block;
    return { type: "clear-all-memory" };
  }

  if (["!ia", "!gemini", "!deepseek"].includes(command)) {
    if (!ctx.args.join(" ").trim()) {
      return `🧠 Use assim: *${ctx.command} sua pergunta*`;
    }
    return null;
  }

  return "❓ Comando não reconhecido. Digite *!ajuda* para ver os disponíveis.";
}
