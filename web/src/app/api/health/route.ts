import { NextResponse } from "next/server";
import { Client } from "pg";

export const runtime = "nodejs";

export async function GET() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    return NextResponse.json(
      { status: "error", message: "DATABASE_URL no está definida" },
      { status: 500 }
    );
  }

  const client = new Client({ connectionString });

  try {
    await client.connect();
    const result = await client.query("SELECT NOW() as now");
    await client.end();

    return NextResponse.json({
      status: "ok",
      db: "connected",
      now: result.rows[0]?.now ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        db: "disconnected",
        message: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}