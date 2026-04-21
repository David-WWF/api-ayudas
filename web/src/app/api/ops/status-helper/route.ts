import { NextResponse } from "next/server";
import { loadAlertJobOpsState } from "@/lib/alerts/alert-job-ops-state";
import {
  getNotificationRecipientCounts,
  listNotificationRecipients,
} from "@/lib/alerts/notification-recipients";

export const runtime = "nodejs";

export async function GET() {
  try {
    const [opsState, recipientCounts, allRecipients] = await Promise.all([
      loadAlertJobOpsState(),
      getNotificationRecipientCounts(),
      listNotificationRecipients(),
    ]);

    const recipients = allRecipients.map((r) => ({
      id: r.id,
      channel: r.channel,
      address: r.address,
      label: r.label,
      enabled: r.enabled,
    }));

    return NextResponse.json({
      ok: true,
      data: {
        opsState,
        recipientCounts,
        recipients,
        requiresWeeklyRunSecret: Boolean(process.env.ALERTS_RUN_SECRET?.trim()),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Error interno",
      },
      { status: 500 }
    );
  }
}
