import { NextRequest, NextResponse } from "next/server";
import {
  ensureNotificationRecipientsTable,
  insertNotificationRecipient,
  isValidEmailAddress,
  isValidTelegramChatId,
  listNotificationRecipients,
  normalizeEmailAddress,
  normalizeTelegramAddress,
  type NotificationChannel,
} from "@/lib/alerts/notification-recipients";

export const runtime = "nodejs";

function mapToJson(r: {
  id: number;
  channel: NotificationChannel;
  address: string;
  label: string | null;
  enabled: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}) {
  return {
    id: r.id,
    channel: r.channel,
    address: r.address,
    label: r.label,
    enabled: r.enabled,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export async function GET() {
  try {
    const rows = await listNotificationRecipients();
    return NextResponse.json({
      ok: true,
      data: rows.map(mapToJson),
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

export async function POST(request: NextRequest) {
  try {
    await ensureNotificationRecipientsTable();

    const body = (await request.json()) as Record<string, unknown>;

    const channel =
      body.channel === "telegram" ? "telegram" : body.channel === "email" ? "email" : null;

    if (!channel) {
      return NextResponse.json(
        { ok: false, error: 'channel debe ser "email" o "telegram"' },
        { status: 400 }
      );
    }

    const rawAddress = typeof body.address === "string" ? body.address : "";
    const address =
      channel === "email" ? normalizeEmailAddress(rawAddress) : normalizeTelegramAddress(rawAddress);

    if (!address) {
      return NextResponse.json({ ok: false, error: "address es obligatorio" }, { status: 400 });
    }

    if (channel === "email" && !isValidEmailAddress(address)) {
      return NextResponse.json({ ok: false, error: "Email no válido" }, { status: 400 });
    }

    if (channel === "telegram" && !isValidTelegramChatId(address)) {
      return NextResponse.json(
        { ok: false, error: "chat_id de Telegram debe ser numérico (ej. 123456 o grupo -100...)" },
        { status: 400 }
      );
    }

    const labelRaw = body.label;
    const label =
      typeof labelRaw === "string" && labelRaw.trim().length > 0 ? labelRaw.trim() : null;

    const enabled = body.enabled === false ? false : true;

    const created = await insertNotificationRecipient({
      channel,
      address,
      label,
      enabled,
    });

    return NextResponse.json({ ok: true, data: mapToJson(created) }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Error interno";
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return NextResponse.json(
        { ok: false, error: "Ese destinatario ya existe en ese canal" },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
