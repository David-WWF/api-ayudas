import { NextResponse } from "next/server";
import { sendAlertsChannelTestEmail } from "@/lib/alerts/mailer";

export const runtime = "nodejs";

export async function POST() {
  const result = await sendAlertsChannelTestEmail();
  return NextResponse.json({
    ok: result.status === "sent",
    status: result.status,
    message: result.message,
  });
}
