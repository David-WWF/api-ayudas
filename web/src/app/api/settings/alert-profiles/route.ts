import { NextRequest, NextResponse } from "next/server";
import type { AlertFilters } from "@/lib/domain/alert-filters";
import { normalizeAlertFilters } from "@/lib/domain/alert-filters";
import { db } from "@/lib/db";

export const runtime = "nodejs";

type AlertProfile = {
  id: number;
  name: string;
  enabled: boolean;
  filters: AlertFilters;
  scheduleCron: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

function mapRowToProfile(row: Record<string, unknown>): AlertProfile {
  const filtersRaw = (row.filters_json ?? {}) as Record<string, unknown>;

  return {
    id: Number(row.id),
    name: String(row.name ?? ""),
    enabled: Boolean(row.enabled),
    filters: normalizeAlertFilters(filtersRaw),
    scheduleCron: typeof row.schedule_cron === "string" ? row.schedule_cron : null,
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

async function ensureTables() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS alert_profiles (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT true,
      filters_json JSONB NOT NULL,
      schedule_cron TEXT NULL DEFAULT '0 9 * * 1',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function GET() {
  try {
    await ensureTables();

    const result = await db.query(`
      SELECT
        id,
        name,
        enabled,
        filters_json,
        schedule_cron,
        created_at::text,
        updated_at::text
      FROM alert_profiles
      ORDER BY created_at DESC
    `);

    const data = result.rows.map((row) => mapRowToProfile(row));
    return NextResponse.json({ ok: true, data });
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
    await ensureTables();

    const body = (await request.json()) as Record<string, unknown>;

    const name =
      typeof body.name === "string" && body.name.trim().length > 0
        ? body.name.trim()
        : null;

    if (!name) {
      return NextResponse.json(
        { ok: false, error: "El nombre del perfil es obligatorio" },
        { status: 400 }
      );
    }

    const enabled = body.enabled === false ? false : true;
    const scheduleCron =
      typeof body.scheduleCron === "string" && body.scheduleCron.trim().length > 0
        ? body.scheduleCron.trim()
        : "0 9 * * 1";

    const filters = normalizeAlertFilters(body.filters);

    const result = await db.query(
      `
      INSERT INTO alert_profiles (
        name,
        enabled,
        filters_json,
        schedule_cron
      )
      VALUES ($1, $2, $3::jsonb, $4)
      RETURNING
        id,
        name,
        enabled,
        filters_json,
        schedule_cron,
        created_at::text,
        updated_at::text
    `,
      [name, enabled, JSON.stringify(filters), scheduleCron]
    );

    return NextResponse.json(
      { ok: true, data: mapRowToProfile(result.rows[0]) },
      { status: 201 }
    );
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