type DigestItem = {
    id: string;
    title: string;
    organization: string | null;
    publicationDate: string | null;
    sourceUrl: string | null;
  };
  
  type DigestProfile = {
    profileId: number;
    profileName: string;
    newItems: DigestItem[];
  };
  
  type SendWeeklyDigestInput = {
    runId: string;
    runAtIso: string;
    profiles: DigestProfile[];
  };
  
  export type SendWeeklyDigestTelegramResult = {
    status: "sent" | "error";
    message: string;
  };
  
  const TELEGRAM_SAFE_LIMIT = 3500;
  const MAX_ITEMS_PER_PROFILE = 10;
  
  function truncate(value: string, max = 120): string {
    if (value.length <= max) return value;
    return `${value.slice(0, max - 3)}...`;
  }
  
  function splitByLimit(text: string, limit: number): string[] {
    if (text.length <= limit) return [text];
  
    const lines = text.split("\n");
    const chunks: string[] = [];
    let current = "";
  
    for (const line of lines) {
      const candidate = current ? `${current}\n${line}` : line;
      if (candidate.length <= limit) {
        current = candidate;
      } else {
        if (current) chunks.push(current);
        if (line.length <= limit) {
          current = line;
        } else {
          // Fallback si una sola línea es enorme
          for (let i = 0; i < line.length; i += limit) {
            chunks.push(line.slice(i, i + limit));
          }
          current = "";
        }
      }
    }
  
    if (current) chunks.push(current);
    return chunks;
  }
  
  function buildTelegramMessages(input: SendWeeklyDigestInput): string[] {
    const totalNew = input.profiles.reduce((acc, p) => acc + p.newItems.length, 0);
  
    const header = [
      "API AYUDAS - RESUMEN SEMANAL",
      `Run ID: ${input.runId}`,
      `Fecha: ${input.runAtIso}`,
      `Perfiles con novedades: ${input.profiles.length}`,
      `Total nuevas convocatorias: ${totalNew}`,
      "",
      "Detalle por perfil a continuacion:",
    ].join("\n");
  
    const details: string[] = [];
  
    for (const profile of input.profiles) {
      const lines: string[] = [];
      lines.push(`PERFIL: ${profile.profileName} (ID ${profile.profileId})`);
      lines.push(`Novedades: ${profile.newItems.length}`);
  
      const shown = profile.newItems.slice(0, MAX_ITEMS_PER_PROFILE);
      for (const item of shown) {
        lines.push(`- ${truncate(item.title, 140)}`);
        lines.push(`  ID: ${item.id}`);
        if (item.organization) lines.push(`  Org: ${truncate(item.organization, 80)}`);
        if (item.publicationDate) lines.push(`  Fec: ${item.publicationDate}`);
        if (item.sourceUrl) lines.push(`  URL: ${item.sourceUrl}`);
      }
  
      if (profile.newItems.length > shown.length) {
        lines.push(`... y ${profile.newItems.length - shown.length} mas (ver email para detalle completo).`);
      }
  
      details.push(lines.join("\n"));
    }
  
    const merged = [header, ...details].join("\n\n");
    return splitByLimit(merged, TELEGRAM_SAFE_LIMIT);
  }
  
  async function sendTelegramMessage(
    botToken: string,
    chatId: string,
    text: string
  ): Promise<void> {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });
  
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Telegram API ${response.status}: ${body}`);
    }
  }
  
  export async function sendWeeklyDigestTelegram(
    input: SendWeeklyDigestInput
  ): Promise<SendWeeklyDigestTelegramResult> {
    const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
    const chatId = process.env.TELEGRAM_CHAT_ID?.trim() ?? "";
  
    if (!botToken || !chatId) {
      return {
        status: "error",
        message: "Falta TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID.",
      };
    }
  
    if (input.profiles.length === 0) {
      return {
        status: "sent",
        message: "Sin novedades; no hubo mensajes de detalle para Telegram.",
      };
    }
  
    try {
      const messages = buildTelegramMessages(input);
      for (const message of messages) {
        await sendTelegramMessage(botToken, chatId, message);
      }
  
      return {
        status: "sent",
        message: `Telegram enviado en ${messages.length} mensaje(s).`,
      };
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : "Error desconocido enviando Telegram.",
      };
    }
  }