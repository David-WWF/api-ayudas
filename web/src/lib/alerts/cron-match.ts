import CronExpressionParser from "cron-parser";
import { DateTime } from "luxon";

/**
 * Indica si la expresión cron del perfil debe ejecutarse en el minuto de `at`
 * (misma fecha/hora local según `timeZone`).
 *
 * Usa un ancla a mitad de minuto para evitar ambigüedades de `prev()` en el tick exacto
 * con cron-parser v5.
 */
export function profileCronMatchesNow(
  cronExpression: string | null | undefined,
  at: Date,
  timeZone: string
): boolean {
  const expr = (cronExpression ?? "0 9 * * 1").trim();
  const z = timeZone.trim() || "UTC";

  try {
    const here = DateTime.fromJSDate(at, { zone: z });
    if (!here.isValid) return false;

    const anchor = here.startOf("minute").plus({ seconds: 30 }).toJSDate();
    const interval = CronExpressionParser.parse(expr, {
      currentDate: anchor,
      tz: z,
    });

    const prev = interval.prev().toDate();
    const tickMin = DateTime.fromJSDate(prev, { zone: z }).startOf("minute").toMillis();
    return tickMin === here.startOf("minute").toMillis();
  } catch {
    return false;
  }
}

export function getAlertsTimeZone(): string {
  return process.env.TZ?.trim() || "UTC";
}

export function shouldRespectProfileCron(): boolean {
  const v = process.env.ALERTS_RESPECT_PROFILE_CRON?.trim().toLowerCase();
  if (v === undefined || v === "") return false;
  return v === "1" || v === "true" || v === "yes";
}
