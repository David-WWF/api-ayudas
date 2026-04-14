import nodemailer from "nodemailer";
import { getDigestEmailSubject, getDigestTitleFull } from "./digest-copy";
import { getActiveEmailAddresses } from "./notification-recipients";
import {
  backoffDelayMs,
  getAlertsChannelRetries,
  getAlertsChannelRetryDelayMs,
  sleep,
} from "./channel-retry";
import type { GrantAiResult } from "@/lib/ai/grant-analyzer";

// Estructura minima de una convocatoria incluida en el resumen.
type DigestItem = {
  id: string;
  title: string;
  organization: string | null;
  publicationDate: string | null;
  sourceUrl: string | null;
};

// Agrupa las novedades por perfil de alerta.
type DigestProfile = {
  profileId: number;
  profileName: string;
  newItems: DigestItem[];
};

// Datos de entrada que recibe el canal email para el digest (cadencia en ALERTS_DIGEST_PERIOD).
type SendWeeklyDigestInput = {
  runId: string;
  runAtIso: string;
  profiles: DigestProfile[];
  aiMap?: Map<string, GrantAiResult>;
};

export type SendWeeklyDigestResult = {
  status: "sent" | "error";
  message: string;
};

function parseRecipientsFromEnv(): string[] {
  // Fallback si no hay filas activas en notification_recipients.
  const raw = process.env.ALERT_RECIPIENTS ?? "";
  return raw
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter((v) => v.length > 0);
}

async function resolveEmailRecipients(): Promise<string[]> {
  const fromDb = await getActiveEmailAddresses();
  if (fromDb.length > 0) return fromDb;
  return parseRecipientsFromEnv();
}

function escapeHtml(value: string): string {
  // Escapamos campos dinamicos para evitar HTML invalido o inyecciones.
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const RELEVANCE_ORDER: Record<string, number> = { alta: 0, media: 1, baja: 2 };
const RELEVANCE_LABEL: Record<string, string> = { alta: "ALTA", media: "MEDIA", baja: "BAJA" };
const RELEVANCE_COLOR: Record<string, string> = { alta: "#16a34a", media: "#ca8a04", baja: "#dc2626" };
const RELEVANCE_EMOJI: Record<string, string> = { alta: "🟢", media: "🟡", baja: "🔴" };

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

/* ---------- Texto plano: con IA (agrupado por perfil) ---------- */

function buildAiTextBody(input: SendWeeklyDigestInput): string {
  const { aiMap } = input;
  const lines: string[] = [];
  lines.push(getDigestTitleFull());
  lines.push(`Run ID: ${input.runId}`);
  lines.push(`Fecha ejecución: ${input.runAtIso}`);
  lines.push("");
  lines.push("=== 🤖 RECOMENDACIÓN IA ===");
  lines.push("Análisis automático basado en el perfil de tu empresa (sugerencia, verificar condiciones oficiales).");
  lines.push("");

  for (const profile of input.profiles) {
    const sorted = sortByRelevance(profile.newItems, aiMap!);

    lines.push(`--- ${profile.profileName} (${profile.newItems.length} novedades) ---`);
    lines.push("");

    sorted.forEach(({ item, ai }, idx) => {
      const label = RELEVANCE_LABEL[ai?.relevance ?? "baja"] ?? "BAJA";
      lines.push(`${idx + 1}. [${label}] ${item.title}`);
      if (ai?.reason) lines.push(`   ${ai.reason}`);
      if (item.sourceUrl) lines.push(`   ${item.sourceUrl}`);
      lines.push("");
    });
  }

  lines.push("⚠️ Verificar siempre las condiciones oficiales de cada convocatoria.");
  return lines.join("\n");
}

/* ---------- Texto plano: sin IA (formato clásico) ---------- */

function buildClassicTextBody(input: SendWeeklyDigestInput): string {
  const lines: string[] = [];
  lines.push(getDigestTitleFull());
  lines.push(`Run ID: ${input.runId}`);
  lines.push(`Fecha ejecución: ${input.runAtIso}`);
  lines.push("");

  for (const profile of input.profiles) {
    lines.push(`Perfil: ${profile.profileName} (ID ${profile.profileId})`);
    lines.push(`Novedades: ${profile.newItems.length}`);

    for (const item of profile.newItems) {
      lines.push(`- ${item.title}`);
      lines.push(`  ID: ${item.id}`);
      if (item.organization) lines.push(`  Organismo: ${item.organization}`);
      if (item.publicationDate) lines.push(`  Publicación: ${item.publicationDate}`);
      if (item.sourceUrl) lines.push(`  Fuente: ${item.sourceUrl}`);
    }

    lines.push("");
  }

  return lines.join("\n");
}

function buildTextBody(input: SendWeeklyDigestInput): string {
  return hasAiResults(input) ? buildAiTextBody(input) : buildClassicTextBody(input);
}

/* ---------- HTML: con IA (agrupado por perfil) ---------- */

function buildAiProfileHtml(profile: DigestProfile, aiMap: Map<string, GrantAiResult>): string {
  const sorted = sortByRelevance(profile.newItems, aiMap);

  const rows = sorted
    .map(({ item, ai }, idx) => {
      const relevance = ai?.relevance ?? "baja";
      const color = RELEVANCE_COLOR[relevance] ?? "#dc2626";
      const emoji = RELEVANCE_EMOJI[relevance] ?? "🔴";
      const label = RELEVANCE_LABEL[relevance] ?? "BAJA";
      const reason = ai?.reason ? escapeHtml(ai.reason) : "";
      const link = item.sourceUrl
        ? `<a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noreferrer" style="color:#2563eb;">Ver ayuda</a>`
        : "";

      return `
        <tr>
          <td style="padding:8px 6px; vertical-align:top; font-size:14px; border-bottom:1px solid #e5e7eb;">${idx + 1}</td>
          <td style="padding:8px 6px; vertical-align:top; border-bottom:1px solid #e5e7eb;">
            <span style="display:inline-block; padding:2px 8px; border-radius:4px; font-size:12px; font-weight:bold; color:#fff; background:${color};">${emoji} ${label}</span>
          </td>
          <td style="padding:8px 6px; vertical-align:top; border-bottom:1px solid #e5e7eb;">
            <strong style="font-size:14px;">${escapeHtml(item.title)}</strong><br/>
            ${reason ? `<span style="font-size:13px; color:#4b5563;">${reason}</span><br/>` : ""}
            ${link}
          </td>
        </tr>
      `;
    })
    .join("");

  return `
    <section style="margin-bottom:20px;">
      <h4 style="margin:0 0 8px 0; color:#374151;">${escapeHtml(profile.profileName)} <span style="font-weight:normal; font-size:13px; color:#6b7280;">(${profile.newItems.length} novedades)</span></h4>
      <table style="width:100%; border-collapse:collapse;">
        <thead>
          <tr style="text-align:left;">
            <th style="padding:6px; font-size:12px; color:#6b7280; border-bottom:2px solid #d1d5db;">#</th>
            <th style="padding:6px; font-size:12px; color:#6b7280; border-bottom:2px solid #d1d5db;">Relevancia</th>
            <th style="padding:6px; font-size:12px; color:#6b7280; border-bottom:2px solid #d1d5db;">Convocatoria</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
}

function buildAiHtmlBody(input: SendWeeklyDigestInput): string {
  const profileSections = input.profiles
    .map((p) => buildAiProfileHtml(p, input.aiMap!))
    .join("");

  return `
    <div style="font-family:Arial,sans-serif; color:#111827;">
      <h2 style="margin:0 0 12px 0;">${escapeHtml(getDigestTitleFull())}</h2>
      <p style="margin:0 0 8px 0;"><strong>Run ID:</strong> ${escapeHtml(input.runId)}</p>
      <p style="margin:0 0 16px 0;"><strong>Fecha ejecución:</strong> ${escapeHtml(input.runAtIso)}</p>
      <section style="margin-bottom:24px; padding:16px; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px;">
        <h3 style="margin:0 0 8px 0; color:#15803d;">🤖 Recomendación IA</h3>
        <p style="margin:0 0 16px 0; font-size:13px; color:#4b5563;">
          Análisis automático basado en el perfil de tu empresa. Es una sugerencia orientativa; verifica siempre las condiciones oficiales de cada convocatoria.
        </p>
        ${profileSections}
      </section>
    </div>
  `;
}

/* ---------- HTML: sin IA (formato clásico) ---------- */

function buildClassicHtmlBody(input: SendWeeklyDigestInput): string {
  const sections = input.profiles
    .map((profile) => {
      const items = profile.newItems
        .map((item) => {
          const sourceLink = item.sourceUrl
            ? `<a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noreferrer">Ver convocatoria</a>`
            : "Sin enlace oficial";

          return `
            <li style="margin-bottom:10px;">
              <strong>${escapeHtml(item.title)}</strong><br/>
              ID: ${escapeHtml(item.id)}<br/>
              Organismo: ${escapeHtml(item.organization ?? "No informado")}<br/>
              Publicación: ${escapeHtml(item.publicationDate ?? "No informada")}<br/>
              ${sourceLink}
            </li>
          `;
        })
        .join("");

      return `
        <section style="margin-bottom:16px;">
          <h3 style="margin:0 0 8px 0;">${escapeHtml(profile.profileName)} (ID ${profile.profileId})</h3>
          <p style="margin:0 0 8px 0;">Novedades: ${profile.newItems.length}</p>
          <ul style="margin:0; padding-left:18px;">${items}</ul>
        </section>
      `;
    })
    .join("");

  return `
    <div style="font-family:Arial,sans-serif; color:#111827;">
      <h2 style="margin:0 0 12px 0;">${escapeHtml(getDigestTitleFull())}</h2>
      <p style="margin:0 0 8px 0;"><strong>Run ID:</strong> ${escapeHtml(input.runId)}</p>
      <p style="margin:0 0 16px 0;"><strong>Fecha ejecución:</strong> ${escapeHtml(input.runAtIso)}</p>
      ${sections}
    </div>
  `;
}

function buildHtmlBody(input: SendWeeklyDigestInput): string {
  return hasAiResults(input) ? buildAiHtmlBody(input) : buildClassicHtmlBody(input);
}

export async function sendWeeklyDigestEmail(
  input: SendWeeklyDigestInput
): Promise<SendWeeklyDigestResult> {
  // Si no hay novedades no intentamos enviar porque este canal exige contenido.
  if (input.profiles.length === 0) {
    return { status: "error", message: "Sin perfiles con novedades." };
  }


  const recipients = await resolveEmailRecipients();
  if (recipients.length === 0) {
    return {
      status: "error",
      message:
        "No hay destinatarios de email: añade entradas en la web o define ALERT_RECIPIENTS en .env.",
    };
  }

  const host = process.env.SMTP_HOST ?? "";
  const port = Number(process.env.SMTP_PORT ?? "587");
  const user = process.env.SMTP_USER ?? "";
  const pass = process.env.SMTP_PASS ?? "";
  const from = process.env.SMTP_FROM ?? "";
  const secure = process.env.SMTP_SECURE === "true";

  // Validacion temprana para fallar con un mensaje claro de configuracion.
  if (!host || !port || !user || !pass || !from) {
    return {
      status: "error",
      message: "Configuración SMTP incompleta (SMTP_HOST/PORT/USER/PASS/FROM).",
    };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  const subject = getDigestEmailSubject(input.profiles.length);
  const text = buildTextBody(input);
  const html = buildHtmlBody(input);
  const retries = getAlertsChannelRetries();
  const delayBase = getAlertsChannelRetryDelayMs();

  let lastMessage = "Error SMTP desconocido.";

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await transporter.sendMail({
        from,
        to: recipients.join(","),
        subject,
        text,
        html,
      });

      const suffix =
        attempt > 0 ? ` (tras ${attempt} reintento(s)).` : "";
      return {
        status: "sent",
        message: `Email enviado a ${recipients.length} destinatario(s).${suffix}`,
      };
    } catch (error) {
      lastMessage = error instanceof Error ? error.message : "Error SMTP desconocido.";
      if (attempt < retries) {
        await sleep(backoffDelayMs(delayBase, attempt));
      }
    }
  }

  return {
    status: "error",
    message: lastMessage,
  };
}