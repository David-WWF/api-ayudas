import { NextRequest, NextResponse } from "next/server";
import { isAlertsWeeklyRunAuthorized } from "@/lib/alerts/alerts-run-http-auth";
import { consumeWeeklyRunManualRateSlot } from "@/lib/alerts/weekly-run-manual-rate-limit";
import {
  runWeeklyAlerts,
  WeeklyRunAlreadyRunningError,
} from "@/lib/alerts/weekly-runner";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    if (!isAlertsWeeklyRunAuthorized(request)) {
      return NextResponse.json(
        { ok: false, error: "No autorizado para ejecutar el envío de alertas." },
        { status: 401 }
      );
    }

    const rate = consumeWeeklyRunManualRateSlot();
    if (rate.limited) {
      console.warn(
        JSON.stringify({
          event: "weekly_run_ops_ui_rate_limited",
          retryAfterMs: rate.retryAfterMs,
        })
      );
      return NextResponse.json(
        {
          ok: false,
          error: "Demasiadas solicitudes seguidas. Espera unos segundos.",
          retryAfterMs: rate.retryAfterMs,
        },
        { status: 429 }
      );
    }

    console.info(JSON.stringify({ event: "weekly_run_ops_ui_requested" }));
    const data = await runWeeklyAlerts();
    return NextResponse.json({
      ok: true,
      data: {
        runId: data.runId,
        dispatchStatus: data.dispatchStatus,
        totalNewItems: data.totalNewItems,
        profilesSkippedCron: data.profilesSkippedCron,
        emailStatus: data.emailStatus,
        telegramStatus: data.telegramStatus,
      },
    });
  } catch (error) {
    if (error instanceof WeeklyRunAlreadyRunningError) {
      console.warn(JSON.stringify({ event: "weekly_run_ops_ui_conflict" }));
      return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    }
    console.error(
      JSON.stringify({
        event: "weekly_run_ops_ui_failed",
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
