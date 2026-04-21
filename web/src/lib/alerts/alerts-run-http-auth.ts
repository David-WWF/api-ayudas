import type { NextRequest } from "next/server";

/** Misma regla que POST /api/alerts/weekly/run: cabecera x-alerts-secret si ALERTS_RUN_SECRET está definido. */
export function isAlertsWeeklyRunAuthorized(request: NextRequest): boolean {
  const configured = process.env.ALERTS_RUN_SECRET?.trim();
  if (!configured) return true;

  const provided = request.headers.get("x-alerts-secret")?.trim() ?? "";
  return provided === configured;
}
