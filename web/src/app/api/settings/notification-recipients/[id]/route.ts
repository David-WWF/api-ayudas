import { NextRequest, NextResponse } from "next/server";
import {
  deleteNotificationRecipient,
  isValidEmailAddress,
  isValidTelegramChatId,
  updateNotificationRecipient,
  type NotificationChannel,
} from "@/lib/alerts/notification-recipients";

export const runtime = "nodejs";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

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

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await context.params;
    const id = parseId(rawId);
    if (!id) {
      return NextResponse.json({ ok: false, error: "ID inválido" }, { status: 400 });
    }

    const body = (await request.json()) as Record<string, unknown>;

    const patch: Parameters<typeof updateNotificationRecipient>[1] = {};

    if (body.enabled !== undefined) {
      patch.enabled = body.enabled !== false;
    }

    if (body.label !== undefined) {
      patch.label =
        typeof body.label === "string" && body.label.trim().length > 0
          ? body.label.trim()
          : null;
    }

    if (body.channel !== undefined) {
      if (body.channel !== "email" && body.channel !== "telegram") {
        return NextResponse.json(
          { ok: false, error: 'channel debe ser "email" o "telegram"' },
          { status: 400 }
        );
      }
      patch.channel = body.channel;
    }

    if (typeof body.address === "string") {
      // La normalización (email lower / telegram trim) la aplica updateNotificationRecipient
      // usando el canal ya guardado o el que venga en patch.channel.
      patch.address = body.address;
    }

    const updated = await updateNotificationRecipient(id, patch);

    if (!updated) {
      return NextResponse.json({ ok: false, error: "Destinatario no encontrado" }, { status: 404 });
    }

    const ch = updated.channel;
    if (!isValidEmailAddress(updated.address) && ch === "email") {
      return NextResponse.json({ ok: false, error: "Email no válido" }, { status: 400 });
    }
    if (!isValidTelegramChatId(updated.address) && ch === "telegram") {
      return NextResponse.json(
        { ok: false, error: "chat_id de Telegram debe ser numérico" },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, data: mapToJson(updated) });
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

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await context.params;
    const id = parseId(rawId);
    if (!id) {
      return NextResponse.json({ ok: false, error: "ID inválido" }, { status: 400 });
    }

    const ok = await deleteNotificationRecipient(id);
    if (!ok) {
      return NextResponse.json({ ok: false, error: "Destinatario no encontrado" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}
