/**
 * Textos visibles del digest (email, Telegram, asunto).
 *
 * La cadencia real la marca el cron (`ALERTS_AUTORUN_CRON`); esta etiqueta solo
 * debe coincidir con lo que operativamente enviáis (p. ej. diario vs semanal).
 * Override: ALERTS_DIGEST_PERIOD=diario|semanal|… (cualquier palabra corta en español).
 */
export function getDigestPeriodLabel(): string {
  const raw = process.env.ALERTS_DIGEST_PERIOD?.trim();
  if (raw && raw.length > 0) return raw;
  return "diario";
}

export function getDigestTitleFull(): string {
  return `Resumen ${getDigestPeriodLabel()} de alertas - api-ayudas`;
}

export function getDigestTelegramBanner(): string {
  const label = getDigestPeriodLabel().toUpperCase();
  return `API AYUDAS - RESUMEN ${label}`;
}

export function getDigestEmailSubject(profilesWithNewsCount: number): string {
  const p = getDigestPeriodLabel();
  const d = new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
  return `[api-ayudas] Resumen ${p} ${d} (${profilesWithNewsCount} perfiles con novedades)`;
}
