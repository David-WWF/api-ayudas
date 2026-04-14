import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

async function ensureTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS company_profile (
      id INTEGER PRIMARY KEY DEFAULT 1,
      context_text TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT company_profile_singleton CHECK (id = 1)
    )
  `);
  await db.query(`
    INSERT INTO company_profile (id) VALUES (1)
    ON CONFLICT (id) DO NOTHING
  `);
}

export async function GET() {
  try {
    await ensureTable();

    const result = await db.query(`
      SELECT context_text, updated_at::text
      FROM company_profile
      WHERE id = 1
    `);

    const row = result.rows[0] ?? {};
    return NextResponse.json({
      ok: true,
      data: {
        contextText: String(row.context_text ?? ""),
        updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    await ensureTable();

    const body = (await request.json()) as Record<string, unknown>;
    const contextText =
      typeof body.contextText === "string" ? body.contextText.trim() : "";

    await db.query(
      `UPDATE company_profile SET context_text = $1, updated_at = NOW() WHERE id = 1`,
      [contextText]
    );

    const result = await db.query(`
      SELECT context_text, updated_at::text
      FROM company_profile
      WHERE id = 1
    `);

    const row = result.rows[0] ?? {};
    return NextResponse.json({
      ok: true,
      data: {
        contextText: String(row.context_text ?? ""),
        updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}
