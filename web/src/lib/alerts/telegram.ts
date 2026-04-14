import { getDigestTelegramBanner } from "./digest-copy";
import { getActiveTelegramChatIds } from "./notification-recipients";
import {
  backoffDelayMs,
  getAlertsChannelRetries,
  getAlertsChannelRetryDelayMs,
  sleep,
} from "./channel-retry";
import type { GrantAiResult } from "@/lib/ai/grant-analyzer";

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
  aiMap?: Map<string, GrantAiResult>;
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

const RELEVANCE_ORDER: Record<string, number> = { alta: 0, media: 1, baja: 2 };
const RELEVANCE_EMOJI: Record<string, string> = { alta: "🟢", media: "🟡", baja: "🔴" };
const RELEVANCE_LABEL: Record<string, string> = { alta: "ALTA", media: "MEDIA", baja: "BAJA" };

type ItemWithAi = { item: DigestItem; ai: GrantAiResult | undefined };

function relevanceSortKey(entry: ItemWithAi): number {
  const r = entry.ai?.relevance?.toLowerCase().trim() ?? "baja";
  return RELEVANCE_ORDER[r] ?? 2;
}

function sortByRelevance(items: DigestItem[], aiMap: Map<string, GrantAiResult>): ItemWithAi[] {
  return items
    .map((item) => ({ item, ai: aiMap.get(item.id) }))
    .sort((a, b) => {
      const diff = relevanceSortKey(a) - relevanceSortKey(b);
      if (diff !== 0) return diff;
      return a.item.title.localeCompare(b.item.title, "es");
    });
}

function hasAiResults(input: SendWeeklyDigestInput): boolean {
  const { aiMap } = input;
  if (!aiMap || aiMap.size === 0) return false;
  return input.profiles.some((p) => p.newItems.some((item) => aiMap.has(item.id)));
}

/* ---------- Con IA: un bloque por perfil, todas detalladas ---------- */

function buildAiTelegramBlocks(input: SendWeeklyDigestInput): string[] {
  const { aiMap } = input;
  const blocks: string[] = [];

  for (const profile of input.profiles) {
    const sorted = sortByRelevance(profile.newItems, aiMap!);

    const shown = sorted.slice(0, MAX_ITEMS_PER_PROFILE);
    const lines: string[] = [];
    lines.push(`━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`📋  ${profile.profileName}`);
    lines.push(`     ${profile.newItems.length} novedades`);
    lines.push(``);

    shown.forEach(({ item, ai }, idx) => {
      const relevance = ai?.relevance ?? "baja";
      const emoji = RELEVANCE_EMOJI[relevance] ?? "🔴";
      const label = RELEVANCE_LABEL[relevance] ?? "BAJA";
      lines.push(`  ${idx + 1}.  ${emoji} ${label}`);
      lines.push(`       ${truncate(item.title, 120)}`);
      if (ai?.reason) lines.push(`       💬 ${truncate(ai.reason, 150)}`);
      if (item.sourceUrl) lines.push(`       🔗 ${item.sourceUrl}`);
      lines.push(``);
    });

    if (profile.newItems.length > shown.length) {
      lines.push(`  ... y ${profile.newItems.length - shown.length} más (ver email)`);
      lines.push(``);
    }

    blocks.push(lines.join("\n"));
  }

  return blocks;
}

/* ---------- Sin IA: formato clásico por perfil ---------- */

function buildClassicTelegramBlocks(input: SendWeeklyDigestInput): string[] {
  const blocks: string[] = [];

  for (const profile of input.profiles) {
    const lines: string[] = [];
    lines.push(`━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`📋  ${profile.profileName}`);
    lines.push(`     ${profile.newItems.length} novedades`);
    lines.push(``);

    const shown = profile.newItems.slice(0, MAX_ITEMS_PER_PROFILE);

    shown.forEach((item, index) => {
      lines.push(`  ${index + 1}.  ${truncate(item.title, 140)}`);
      if (item.organization) lines.push(`       🏛 ${truncate(item.organization, 80)}`);
      if (item.publicationDate) lines.push(`       📅 ${item.publicationDate}`);
      if (item.sourceUrl) lines.push(`       🔗 ${item.sourceUrl}`);
      lines.push(``);
    });

    if (profile.newItems.length > shown.length) {
      lines.push(`  ... y ${profile.newItems.length - shown.length} más (ver email)`);
      lines.push(``);
    }

    blocks.push(lines.join("\n"));
  }

  return blocks;
}

function buildTelegramMessages(input: SendWeeklyDigestInput): string[] {
  const totalNew = input.profiles.reduce((acc, p) => acc + p.newItems.length, 0);
  const useAi = hasAiResults(input);

  const headerLines = [
    `📢  ${getDigestTelegramBanner()}`,
    ``,
    `📅  ${input.runAtIso}`,
    `📊  ${input.profiles.length} perfiles  ·  ${totalNew} convocatorias nuevas`,
    `🆔  ${input.runId}`,
  ];

  if (useAi) {
    headerLines.push(``);
    headerLines.push(`🤖  RECOMENDACIÓN IA`);
    headerLines.push(`Sugerencia según perfil de empresa.`);
    headerLines.push(`⚠️  Verificar siempre condiciones oficiales.`);
  }

  const header = headerLines.join("\n");

  const blocks = useAi
    ? buildAiTelegramBlocks(input)
    : buildClassicTelegramBlocks(input);

  return splitByBlocks(header, blocks, TELEGRAM_SAFE_LIMIT);
}

async function sendTelegramMessageOnce(
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

async function sendTelegramMessageWithRetries(
  botToken: string,
  chatId: string,
  text: string
): Promise<void> {
  const retries = getAlertsChannelRetries();
  const delayBase = getAlertsChannelRetryDelayMs();
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await sendTelegramMessageOnce(botToken, chatId, text);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(backoffDelayMs(delayBase, attempt));
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Error desconocido enviando Telegram.");
}

async function resolveTelegramChatIds(): Promise<string[]> {
  const fromDb = await getActiveTelegramChatIds();
  if (fromDb.length > 0) return fromDb;
  const single = process.env.TELEGRAM_CHAT_ID?.trim() ?? "";
  return single ? [single] : [];
}

export async function sendWeeklyDigestTelegram(
  input: SendWeeklyDigestInput
): Promise<SendWeeklyDigestTelegramResult> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  const chatIds = await resolveTelegramChatIds();

  if (!botToken) {
    return {
      status: "error",
      message: "Falta TELEGRAM_BOT_TOKEN.",
    };
  }

  if (chatIds.length === 0) {
    return {
      status: "error",
      message:
        "No hay chats de Telegram: añade IDs en la web o define TELEGRAM_CHAT_ID en .env.",
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
    for (const chatId of chatIds) {
      for (const message of messages) {
        await sendTelegramMessageWithRetries(botToken, chatId, message);
      }
    }

    return {
      status: "sent",
      message: `Telegram enviado a ${chatIds.length} chat(s), ${messages.length} mensaje(s) por chat.`,
    };
  } catch (error) {
    // Error controlado para que el runner lo consolide en historial.
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Error desconocido enviando Telegram.",
    };
  }
}