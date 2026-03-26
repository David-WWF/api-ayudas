import { NextRequest, NextResponse } from "next/server";
import {
  runWeeklyAlerts,
  isWeeklyRunInProgress,
  WeeklyRunAlreadyRunningError,
} from "@/lib/alerts/weekly-runner";

export const runtime = "nodejs";

function isAuthorized(request: NextRequest): boolean {
  const configured = process.env.ALERTS_RUN_SECRET?.trim();
  if (!configured) return true; // Si no hay secreto configurado, no bloquea (entorno local)

  const provided = request.headers.get("x-alerts-secret")?.trim() ?? "";
  return provided === configured;
}

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json(
        { ok: false, error: "No autorizado para ejecutar el job semanal." },
        { status: 401 }
      );
    }

    console.info(JSON.stringify({ event: "weekly_run_http_requested" }));
    const data = await runWeeklyAlerts();
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    if (error instanceof WeeklyRunAlreadyRunningError) {
      console.warn(JSON.stringify({ event: "weekly_run_http_conflict" }));
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 409 }
      );
    }
    console.error(
      JSON.stringify({
        event: "weekly_run_http_failed",
        error: error instanceof Error ? error.message : "error_desconocido",
      })
    );
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Error interno ejecutando alertas.",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    inProgress: isWeeklyRunInProgress(),
    message: "Usa POST para ejecutar el job semanal de alertas.",
  });
}