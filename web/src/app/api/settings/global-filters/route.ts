import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

type GlobalFilters = {
  searchText: string;
  tipoAdministracion: string | null;
  regionId: number | null;
  fechaDesde: string | null;
  fechaHasta: string | null;
  orderBy: string;
  direccion: "asc" | "desc";
  updatedAt: string | null;
};

const ALLOWED_TIPO_ADMIN = ["C", "A", "L", "O"] as const;
const ALLOWED_ORDER = [
  "numeroConvocatoria",
  "mrr",
  "nivel1",
  "nivel2",
  "nivel3",
  "fechaRecepcion",
  "descripcion",
  "descripcionLeng",
] as const;

async function ensureTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS global_filters (
      id INTEGER PRIMARY KEY,
      search_text TEXT NOT NULL DEFAULT '',
      tipo_administracion VARCHAR(1) NULL,
      region_id INTEGER NULL,
      fecha_desde DATE NULL,
      fecha_hasta DATE NULL,
      order_by TEXT NOT NULL DEFAULT 'fechaRecepcion',
      direccion VARCHAR(4) NOT NULL DEFAULT 'desc',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Fila única (id=1)
  await db.query(
    `
    INSERT INTO global_filters (id)
    VALUES (1)
    ON CONFLICT (id) DO NOTHING
  `
  );
}

function mapRowToResponse(row: Record<string, unknown>): GlobalFilters {
  return {
    searchText: String(row.search_text ?? ""),
    tipoAdministracion:
      typeof row.tipo_administracion === "string" ? row.tipo_administracion : null,
    regionId: typeof row.region_id === "number" ? row.region_id : null,
    fechaDesde: typeof row.fecha_desde === "string" ? row.fecha_desde : null,
    fechaHasta: typeof row.fecha_hasta === "string" ? row.fecha_hasta : null,
    orderBy: typeof row.order_by === "string" ? row.order_by : "fechaRecepcion",
    direccion: row.direccion === "asc" ? "asc" : "desc",
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

export async function GET() {
  try {
    await ensureTable();

    const result = await db.query(
      `
      SELECT
        search_text,
        tipo_administracion,
        region_id,
        fecha_desde::text,
        fecha_hasta::text,
        order_by,
        direccion,
        updated_at::text
      FROM global_filters
      WHERE id = 1
    `
    );

    const row = result.rows[0] ?? {};
    return NextResponse.json({ ok: true, data: mapRowToResponse(row) });
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

export async function PUT(request: NextRequest) {
  try {
    await ensureTable();

    const body = (await request.json()) as Partial<GlobalFilters>;

    const searchText = typeof body.searchText === "string" ? body.searchText : "";

    const tipoAdministracion =
      typeof body.tipoAdministracion === "string" &&
      (ALLOWED_TIPO_ADMIN as readonly string[]).includes(body.tipoAdministracion)
        ? body.tipoAdministracion
        : null;

    const regionId =
      typeof body.regionId === "number" && Number.isInteger(body.regionId) && body.regionId > 0
        ? body.regionId
        : null;

    const fechaDesde =
      typeof body.fechaDesde === "string" && body.fechaDesde.length > 0
        ? body.fechaDesde
        : null;

    const fechaHasta =
      typeof body.fechaHasta === "string" && body.fechaHasta.length > 0
        ? body.fechaHasta
        : null;

    const orderBy =
      typeof body.orderBy === "string" &&
      (ALLOWED_ORDER as readonly string[]).includes(body.orderBy)
        ? body.orderBy
        : "fechaRecepcion";

    const direccion = body.direccion === "asc" ? "asc" : "desc";

    await db.query(
      `
      UPDATE global_filters
      SET
        search_text = $1,
        tipo_administracion = $2,
        region_id = $3,
        fecha_desde = $4,
        fecha_hasta = $5,
        order_by = $6,
        direccion = $7,
        updated_at = NOW()
      WHERE id = 1
    `,
      [searchText, tipoAdministracion, regionId, fechaDesde, fechaHasta, orderBy, direccion]
    );

    const result = await db.query(
      `
      SELECT
        search_text,
        tipo_administracion,
        region_id,
        fecha_desde::text,
        fecha_hasta::text,
        order_by,
        direccion,
        updated_at::text
      FROM global_filters
      WHERE id = 1
    `
    );

    return NextResponse.json({ ok: true, data: mapRowToResponse(result.rows[0] ?? {}) });
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