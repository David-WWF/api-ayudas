/**
 * Textos visibles del digest (email, Telegram, asunto).
 *
 * La cadencia real la marca el cron (`ALERTS_AUTORUN_CRON`); esta etiqueta solo
 * debe coincidir con lo que operativamente enviáis (p. ej. diario vs semanal).
 * Override: ALERTS_DIGEST_PERIOD=diario|semanal|… (cualquier palabra corta en español).
 */

/** Nombre del servicio en titulares (correo HTML/texto, asunto y cabecera Telegram). */
export const DIGEST_BRAND_NAME = "Servicio de Alertas Subvenciones WE.TECH";

export function getDigestPeriodLabel(): string {
  const raw = process.env.ALERTS_DIGEST_PERIOD?.trim();
  if (raw && raw.length > 0) return raw;
  return "diario";
}

export function getDigestTitleFull(): string {
  return DIGEST_BRAND_NAME;
}

export function getDigestTelegramBanner(): string {
  const label = getDigestPeriodLabel().toUpperCase();
  return `${DIGEST_BRAND_NAME} — RESUMEN ${label}`;
}

export function getDigestEmailSubject(profilesWithNewsCount: number): string {
  const p = getDigestPeriodLabel();
  const d = new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
  return `[WE.TECH] Resumen ${p} ${d} (${profilesWithNewsCount} perfiles con novedades)`;
}
