import { db } from "@/lib/db";

export type AlertJobOpsStored = {
  lastRunId: string;
  lastFinishedAt: string | null;
  lastDispatchStatus: string;
  lastEmailStatus: string;
  lastEmailMessage: string;
  lastTelegramStatus: string;
  lastTelegramMessage: string;
  lastSummaryJson: Record<string, unknown>;
  lastLogText: string;
};

export async function ensureAlertJobOpsStateTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS alert_job_ops_state (
      id INTEGER PRIMARY KEY DEFAULT 1,
      last_run_id TEXT NOT NULL DEFAULT '',
      last_finished_at TIMESTAMPTZ,
      last_dispatch_status TEXT NOT NULL DEFAULT '',
      last_email_status TEXT NOT NULL DEFAULT '',
      last_email_message TEXT NOT NULL DEFAULT '',
      last_telegram_status TEXT NOT NULL DEFAULT '',
      last_telegram_message TEXT NOT NULL DEFAULT '',
      last_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      last_log_text TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT alert_job_ops_state_singleton CHECK (id = 1)
    )
  `);
  await db.query(`INSERT INTO alert_job_ops_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
}

const MAX_LOG_TEXT = 12000;

export async function saveAlertJobOpsState(input: {
  lastRunId: string;
  lastFinishedAt: Date;
  lastDispatchStatus: string;
  lastEmailStatus: string;
  lastEmailMessage: string;
  lastTelegramStatus: string;
  lastTelegramMessage: string;
  lastSummaryJson: Record<string, unknown>;
  lastLogText: string;
}) {
  await ensureAlertJobOpsStateTable();
  const logText =
    input.lastLogText.length > MAX_LOG_TEXT
      ? `${input.lastLogText.slice(0, MAX_LOG_TEXT - 20)}\n…(truncado)`
      : input.lastLogText;

  await db.query(
    `
    UPDATE alert_job_ops_state SET
      last_run_id = $1,
      last_finished_at = $2,
      last_dispatch_status = $3,
      last_email_status = $4,
      last_email_message = $5,
      last_telegram_status = $6,
      last_telegram_message = $7,
      last_summary_json = $8::jsonb,
      last_log_text = $9,
      updated_at = NOW()
    WHERE id = 1
    `,
    [
      input.lastRunId,
      input.lastFinishedAt,
      input.lastDispatchStatus,
      input.lastEmailStatus,
      input.lastEmailMessage,
      input.lastTelegramStatus,
      input.lastTelegramMessage,
      JSON.stringify(input.lastSummaryJson),
      logText,
    ]
  );
}

export async function loadAlertJobOpsState(): Promise<AlertJobOpsStored | null> {
  await ensureAlertJobOpsStateTable();
  const result = await db.query(
    `
    SELECT
      last_run_id,
      last_finished_at::text,
      last_dispatch_status,
      last_email_status,
      last_email_message,
      last_telegram_status,
      last_telegram_message,
      last_summary_json,
      last_log_text
    FROM alert_job_ops_state
    WHERE id = 1
    `
  );
  if (result.rowCount === 0) return null;
  const row = result.rows[0] as Record<string, unknown>;
  return {
    lastRunId: String(row.last_run_id ?? ""),
    lastFinishedAt: typeof row.last_finished_at === "string" ? row.last_finished_at : null,
    lastDispatchStatus: String(row.last_dispatch_status ?? ""),
    lastEmailStatus: String(row.last_email_status ?? ""),
    lastEmailMessage: String(row.last_email_message ?? ""),
    lastTelegramStatus: String(row.last_telegram_status ?? ""),
    lastTelegramMessage: String(row.last_telegram_message ?? ""),
    lastSummaryJson:
      row.last_summary_json && typeof row.last_summary_json === "object"
        ? (row.last_summary_json as Record<string, unknown>)
        : {},
    lastLogText: String(row.last_log_text ?? ""),
  };
}
