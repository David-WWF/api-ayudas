import { NextResponse } from "next/server";

export const runtime = "nodejs";

type RegionNode = {
  id?: unknown;
  descripcion?: unknown;
  children?: unknown;
};

type RegionOption = {
  id: number;
  name: string;
};

// Extrae CCAA (códigos tipo ES11, ES12, ES30...) desde árbol /regiones
function extractCcaa(nodes: RegionNode[]): RegionOption[] {
  const out: RegionOption[] = [];

  for (const n1 of nodes) {
    const level2 = Array.isArray(n1.children) ? (n1.children as RegionNode[]) : [];
    for (const n2 of level2) {
      const id = typeof n2.id === "number" ? n2.id : null;
      const desc = typeof n2.descripcion === "string" ? n2.descripcion : null;
      if (!id || !desc) continue;

      // Esperamos formato "ES11 - GALICIA", "ES30 - COMUNIDAD DE MADRID", etc.
      if (!/^ES\d{2}\s*-/.test(desc)) continue;

      const name = desc.replace(/^ES\d{2}\s*-\s*/i, "").trim();
      out.push({ id, name });
    }
  }

  // Orden alfabético para UX
  out.sort((a, b) => a.name.localeCompare(b.name, "es"));
  return out;
}

export async function GET() {
  try {
    const base =
      process.env.BDNS_BASE_URL ?? "https://www.pap.hacienda.gob.es/bdnstrans/api";
    const normalizedBase = base.replace(/\/+$/, "");
    const url = `${normalizedBase}/regiones?vpd=GE`;

    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `BDNS respondió ${res.status}` },
        { status: 502 }
      );
    }

    const json = (await res.json()) as RegionNode[];
    if (!Array.isArray(json) || json.length === 0) {
      return NextResponse.json({ ok: true, data: [] as RegionOption[] });
    }

    // El árbol suele venir con raíz ES - ESPAÑA
    const root = json[0];
    const children = Array.isArray(root.children) ? (root.children as RegionNode[]) : [];
    const ccaa = extractCcaa(children);

    return NextResponse.json({ ok: true, data: ccaa });
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