type DigestItem = {
  id: string;
  title: string;
  organization: string | null;
  publicationDate: string | null;
  sourceUrl: string | null;
};

// Agrupacion de novedades por perfil para renderizar mensajes compactos.
type DigestProfile = {
  profileId: number;
  profileName: string;
  newItems: DigestItem[];
};

// Contrato de entrada compartido con el resto de canales.
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
  // Telegram tiene limite de caracteres; truncamos campos largos.
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3)}...`;
}

function splitByBlocks(header: string, blocks: string[], limit: number): string[] {
  // Construye chunks preservando bloques enteros por perfil para mejorar legibilidad.
  const chunks: string[] = [];
  let current = header;

  for (const block of blocks) {
    const candidate = `${current}\n\n${block}`;
    if (candidate.length <= limit) {
      current = candidate;
      continue;
    }

    // Cerramos chunk actual y empezamos uno nuevo con el bloque completo
    chunks.push(current);
    if (block.length <= limit) {
      current = block;
    } else {
      // Fallback extremo: dividir bloque largo
      for (let i = 0; i < block.length; i += limit) {
        chunks.push(block.slice(i, i + limit));
      }
      current = "";
    }
  }

  if (current.trim().length > 0) {
    chunks.push(current);
  }

  return chunks;
}

function buildTelegramMessages(input: SendWeeklyDigestInput): string[] {
  // Cabecera de contexto para identificar corrida, fecha y volumen.
  const totalNew = input.profiles.reduce((acc, p) => acc + p.newItems.length, 0);

  const header = [
    "API AYUDAS - RESUMEN SEMANAL",
    `Run ID: ${input.runId}`,
    `Fecha: ${input.runAtIso}`,
    `Perfiles con novedades: ${input.profiles.length}`,
    `Total nuevas convocatorias: ${totalNew}`,
    "",
    "DETALLE POR PERFIL",
    "------------------",
  ].join("\n");

  const blocks: string[] = [];

  for (const profile of input.profiles) {
    const lines: string[] = [];
    lines.push(`[Perfil] ${profile.profileName} (ID ${profile.profileId})`);
    lines.push(`[Novedades] ${profile.newItems.length}`);
    lines.push("");

    const shown = profile.newItems.slice(0, MAX_ITEMS_PER_PROFILE);
    // Limitamos items por perfil para no saturar Telegram.

    shown.forEach((item, index) => {
      lines.push(`${index + 1}) ${truncate(item.title, 140)}`);
      lines.push(`   - ID: ${item.id}`);
      lines.push(`   - Organismo: ${truncate(item.organization ?? "No informado", 80)}`);
      lines.push(`   - Fecha: ${item.publicationDate ?? "No informada"}`);
      lines.push(`   - URL: ${item.sourceUrl ?? "Sin enlace"}`);
      lines.push("");
    });

    if (profile.newItems.length > shown.length) {
      // Indicamos que hay mas detalle en email.
      lines.push(
        `... y ${profile.newItems.length - shown.length} mas (ver email para detalle completo).`
      );
    }

    lines.push("--------------------------------------------------");
    blocks.push(lines.join("\n"));
  }

  return splitByBlocks(header, blocks, TELEGRAM_SAFE_LIMIT);
}

async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string
): Promise<void> {
  // Llamada directa a la API HTTP de Telegram Bot.
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
    // Canal obligatorio: faltan credenciales, se reporta error.
    return {
      status: "error",
      message: "Falta TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID.",
    };
  }

  if (input.profiles.length === 0) {
    // Sin novedades consideramos envio correcto sin mensajes de detalle.
    return {
      status: "sent",
      message: "Sin novedades; no hubo mensajes de detalle para Telegram.",
    };
  }

  try {
    const messages = buildTelegramMessages(input);
    // Enviamos secuencialmente para mantener orden natural de lectura.
    for (const message of messages) {
      await sendTelegramMessage(botToken, chatId, message);
    }

    return {
      status: "sent",
      message: `Telegram enviado en ${messages.length} mensaje(s).`,
    };
  } catch (error) {
    // Error controlado para que el runner lo consolide en historial.
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Error desconocido enviando Telegram.",
    };
  }
}