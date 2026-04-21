import { db } from "@/lib/db";

export type NotificationChannel = "email" | "telegram";

export type NotificationRecipient = {
  id: number;
  channel: NotificationChannel;
  address: string;
  label: string | null;
  enabled: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TELEGRAM_ID_RE = /^-?\d+$/;

export function isValidEmailAddress(value: string): boolean {
  return EMAIL_RE.test(value.trim().toLowerCase());
}

export function isValidTelegramChatId(value: string): boolean {
  return TELEGRAM_ID_RE.test(value.trim());
}

export function normalizeEmailAddress(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeTelegramAddress(value: string): string {
  return value.trim();
}

export async function ensureNotificationRecipientsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS notification_recipients (
      id SERIAL PRIMARY KEY,
      channel TEXT NOT NULL CHECK (channel IN ('email', 'telegram')),
      address TEXT NOT NULL,
      label TEXT NULL,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (channel, address)
    )
  `);
}

function mapRow(row: Record<string, unknown>): NotificationRecipient {
  const ch = row.channel === "telegram" ? "telegram" : "email";
  return {
    id: Number(row.id),
    channel: ch,
    address: String(row.address ?? ""),
    label: typeof row.label === "string" && row.label.length > 0 ? row.label : null,
    enabled: Boolean(row.enabled),
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

export async function listNotificationRecipients(): Promise<NotificationRecipient[]> {
  await ensureNotificationRecipientsTable();
  const result = await db.query(`
    SELECT id, channel, address, label, enabled, created_at::text, updated_at::text
    FROM notification_recipients
    ORDER BY channel ASC, id ASC
  `);
  return result.rows.map((row) => mapRow(row));
}

export async function getActiveEmailAddresses(): Promise<string[]> {
  await ensureNotificationRecipientsTable();
  const result = await db.query(`
    SELECT address FROM notification_recipients
    WHERE channel = 'email' AND enabled = true
    ORDER BY id ASC
  `);
  return result.rows.map((r) => String(r.address));
}

export async function getActiveTelegramChatIds(): Promise<string[]> {
  await ensureNotificationRecipientsTable();
  const result = await db.query(`
    SELECT address FROM notification_recipients
    WHERE channel = 'telegram' AND enabled = true
    ORDER BY id ASC
  `);
  return result.rows.map((r) => String(r.address));
}

export async function insertNotificationRecipient(input: {
  channel: NotificationChannel;
  address: string;
  label: string | null;
  enabled: boolean;
}): Promise<NotificationRecipient> {
  await ensureNotificationRecipientsTable();
  const addr =
    input.channel === "email"
      ? normalizeEmailAddress(input.address)
      : normalizeTelegramAddress(input.address);

  const result = await db.query(
    `
    INSERT INTO notification_recipients (channel, address, label, enabled)
    VALUES ($1, $2, $3, $4)
    RETURNING id, channel, address, label, enabled, created_at::text, updated_at::text
    `,
    [input.channel, addr, input.label, input.enabled]
  );
  return mapRow(result.rows[0]);
}

export async function updateNotificationRecipient(
  id: number,
  patch: { label?: string | null; enabled?: boolean; address?: string; channel?: NotificationChannel }
): Promise<NotificationRecipient | null> {
  await ensureNotificationRecipientsTable();

  const current = await db.query(
      `SELECT id, channel, address, label, enabled FROM notification_recipients WHERE id = $1`,
      [id]
    );
  if (current.rowCount === 0) return null;

  const row = current.rows[0] as Record<string, unknown>;
  let channel = (row.channel === "telegram" ? "telegram" : "email") as NotificationChannel;
  let address = String(row.address ?? "");
  let label = typeof row.label === "string" ? row.label : null;
  let enabled = Boolean(row.enabled);

  if (patch.channel !== undefined) channel = patch.channel;
  if (patch.address !== undefined) {
    address =
      channel === "email"
        ? normalizeEmailAddress(patch.address)
        : normalizeTelegramAddress(patch.address);
  }
  if (patch.label !== undefined) label = patch.label;
  if (patch.enabled !== undefined) enabled = patch.enabled;

  const result = await db.query(
    `
    UPDATE notification_recipients
    SET channel = $1, address = $2, label = $3, enabled = $4, updated_at = NOW()
    WHERE id = $5
    RETURNING id, channel, address, label, enabled, created_at::text, updated_at::text
    `,
    [channel, address, label, enabled, id]
  );
  return result.rowCount ? mapRow(result.rows[0]) : null;
}

export async function deleteNotificationRecipient(id: number): Promise<boolean> {
  await ensureNotificationRecipientsTable();
  const result = await db.query(`DELETE FROM notification_recipients WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

/** Chat autorizado para comandos del bot: destinatarios telegram activos u ops en env. */
export async function isTelegramChatAuthorizedForBotCommands(chatId: string): Promise<boolean> {
  const id = normalizeTelegramAddress(chatId);
  const ops = (process.env.TELEGRAM_OPS_CHAT_IDS ?? "")
    .split(",")
    .map((s) => normalizeTelegramAddress(s))
    .filter((x) => x.length > 0);
  if (ops.includes(id)) return true;

  await ensureNotificationRecipientsTable();
  const result = await db.query(
    `
    SELECT 1 FROM notification_recipients
    WHERE channel = 'telegram' AND address = $1 AND enabled = true
    LIMIT 1
    `,
    [id]
  );
  return (result.rowCount ?? 0) > 0;
}

export type RecipientChannelCounts = {
  active: number;
  paused: number;
};

/** Totales por canal para informes (/count_users). */
export async function getNotificationRecipientCounts(): Promise<{
  email: RecipientChannelCounts;
  telegram: RecipientChannelCounts;
}> {
  await ensureNotificationRecipientsTable();
  const result = await db.query(`
    SELECT channel,
      COUNT(*) FILTER (WHERE enabled = true)::int AS active,
      COUNT(*) FILTER (WHERE enabled = false)::int AS paused
    FROM notification_recipients
    GROUP BY channel
  `);

  const out = {
    email: { active: 0, paused: 0 },
    telegram: { active: 0, paused: 0 },
  };

  for (const row of result.rows) {
    const ch = row.channel === "telegram" ? "telegram" : "email";
    const bucket = ch === "telegram" ? out.telegram : out.email;
    bucket.active = Number(row.active ?? 0);
    bucket.paused = Number(row.paused ?? 0);
  }

  return out;
}
