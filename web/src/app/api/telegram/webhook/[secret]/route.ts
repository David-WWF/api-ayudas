import { NextRequest, NextResponse } from "next/server";
import { buildTelegramCommandReply } from "@/lib/alerts/telegram-command-handler";
import { sendTelegramPlainMessageToChat } from "@/lib/alerts/telegram";

export const runtime = "nodejs";

type TelegramUpdate = {
  message?: { chat?: { id?: number }; text?: string };
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ secret: string }> }
) {
  const { secret } = await context.params;
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!expected || secret !== expected) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const msg = (body as TelegramUpdate).message;
  const chatId = msg?.chat?.id != null ? String(msg.chat.id) : null;
  const text = typeof msg?.text === "string" ? msg.text : "";

  if (chatId && text) {
    const reply = await buildTelegramCommandReply(chatId, text);
    if (reply) {
      const sent = await sendTelegramPlainMessageToChat(chatId, reply);
      if (!sent.ok) {
        console.error(
          JSON.stringify({
            event: "telegram_webhook_reply_failed",
            error: sent.message,
          })
        );
      }
    }
  }

  return NextResponse.json({ ok: true });
}
