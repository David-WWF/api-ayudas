import { loadAlertJobOpsState } from "./alert-job-ops-state";
import { sendAlertsChannelTestEmail } from "./mailer";
import {
  getNotificationRecipientCounts,
  isTelegramChatAuthorizedForBotCommands,
} from "./notification-recipients";

function normalizeCommandToken(text: string): string {
  const first = text.trim().split(/\s+/)[0] ?? "";
  const base = first.split("@")[0]?.toLowerCase() ?? "";
  return base;
}

async function formatStatusFromStored(): Promise<string> {
  const row = await loadAlertJobOpsState();
  if (!row || !row.lastRunId) {
    return "Aún no hay datos de ninguna ejecución guardada (tabla alert_job_ops_state vacía o sin ejecuciones registradas).";
  }
  const j = row.lastSummaryJson;
  const lines: string[] = [];
  lines.push("Última ejecución registrada:");
  lines.push(`• runId: ${row.lastRunId}`);
  lines.push(`• fin: ${row.lastFinishedAt ?? "—"}`);
  lines.push(`• dispatch: ${row.lastDispatchStatus}`);
  lines.push(`• email: ${row.lastEmailStatus} — ${row.lastEmailMessage.slice(0, 200)}`);
  lines.push(`• telegram: ${row.lastTelegramStatus} — ${row.lastTelegramMessage.slice(0, 200)}`);
  if (typeof j.totalNewItems === "number") {
    lines.push(`• novedades (última): ${j.totalNewItems}`);
  }
  if (typeof j.profilesSkippedCron === "number") {
    lines.push(`• perfiles omitidos por cron: ${j.profilesSkippedCron}`);
  }
  return lines.join("\n");
}

/** Procesa texto de un update de Telegram; devuelve respuesta o null si no aplica. */
export async function buildTelegramCommandReply(
  chatId: string,
  text: string
): Promise<string | null> {
  const authorized = await isTelegramChatAuthorizedForBotCommands(chatId);
  if (!authorized) {
    return null;
  }

  const cmd = normalizeCommandToken(text);
  if (!cmd.startsWith("/")) {
    return null;
  }

  if (cmd === "/status") {
    return formatStatusFromStored();
  }

  if (cmd === "/last_run") {
    const row = await loadAlertJobOpsState();
    if (!row?.lastLogText) {
      return "No hay log de última ejecución guardado.";
    }
    return row.lastLogText.length > 3800
      ? `${row.lastLogText.slice(0, 3790)}\n…(truncado)`
      : row.lastLogText;
  }

  if (cmd === "/test_mail") {
    const r = await sendAlertsChannelTestEmail();
    return r.status === "sent"
      ? `✅ ${r.message}`
      : `❌ No se pudo enviar el correo de prueba: ${r.message}`;
  }

  if (cmd === "/count_users") {
    const c = await getNotificationRecipientCounts();
    return [
      "Destinatarios en BD (notification_recipients):",
      `• Email: ${c.email.active} activos, ${c.email.paused} pausados`,
      `• Telegram: ${c.telegram.active} activos, ${c.telegram.paused} pausados`,
    ].join("\n");
  }

  if (cmd === "/start" || cmd === "/help") {
    return [
      "Comandos disponibles:",
      "/status — última ejecución guardada",
      "/last_run — log texto de la última ejecución",
      "/test_mail — envía correo de prueba (TEST_MAIL_TO)",
      "/count_users — totales por canal activo/pausado",
    ].join("\n");
  }

  return `Comando desconocido: ${cmd}. Usa /help`;
}
