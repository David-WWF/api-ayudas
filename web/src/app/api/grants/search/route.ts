import { NextRequest, NextResponse } from "next/server";
import { searchGrants } from "@/lib/bdns/client";

export const runtime = "nodejs";

function toPositiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const q = searchParams.get("q") ?? undefined;
  const page = toPositiveInt(searchParams.get("page"), 1);
  const pageSize = toPositiveInt(searchParams.get("pageSize"), 20);

  try {
    const data = await searchGrants({ q, page, pageSize });

    return NextResponse.json(
      {
        ok: true,
        data,
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Error interno",
      },
      { status: 502 }
    );
  }
}