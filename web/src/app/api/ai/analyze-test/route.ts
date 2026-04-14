import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { analyzeGrants, isAiConfigured } from "@/lib/ai/grant-analyzer";
import type { GrantItem } from "@/lib/domain/grants";

export const runtime = "nodejs";

/**
 * POST /api/ai/analyze-test
 *
 * Prueba aislada del análisis IA. Acepta dos modos:
 *
 * 1. Body con `grants` (array de GrantItem) → analiza esas convocatorias.
 * 2. Body vacío o sin `grants` → busca las últimas 5 convocatorias del
 *    snapshot en BD y las usa como ejemplo.
 *
 * Siempre usa el `company_profile` guardado en BD.
 */
export async function POST(request: NextRequest) {
  try {
    if (!isAiConfigured()) {
      return NextResponse.json(
        { ok: false, error: "OPENAI_API_KEY no está configurada." },
        { status: 400 },
      );
    }

    const cpResult = await db.query(
      `SELECT context_text FROM company_profile WHERE id = 1`,
    );
    const companyContext = String(cpResult.rows[0]?.context_text ?? "");

    if (!companyContext.trim()) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No hay perfil de empresa. Guárdalo en Gestionar alertas → Perfil de empresa.",
        },
        { status: 400 },
      );
    }

    let grants: GrantItem[];

    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    if (Array.isArray(body.grants) && body.grants.length > 0) {
      grants = (body.grants as Record<string, unknown>[]).map((g) => ({
        id: String(g.id ?? ""),
        title: String(g.title ?? ""),
        organization:
          typeof g.organization === "string" ? g.organization : null,
        publicationDate:
          typeof g.publicationDate === "string" ? g.publicationDate : null,
        deadlineDate:
          typeof g.deadlineDate === "string" ? g.deadlineDate : null,
        amount: typeof g.amount === "number" ? g.amount : null,
        sourceUrl: typeof g.sourceUrl === "string" ? g.sourceUrl : null,
      }));
    } else {
      const snap = await db.query(`
        SELECT grant_id, title
        FROM grants_snapshot
        ORDER BY last_seen_at DESC
        LIMIT 5
      `);
      if (snap.rowCount === 0) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "No hay convocatorias en el snapshot. Ejecuta primero el job de alertas para tener datos.",
          },
          { status: 400 },
        );
      }
      grants = snap.rows.map((r) => ({
        id: String(r.grant_id),
        title: String(r.title),
        organization: null,
        publicationDate: null,
        deadlineDate: null,
        amount: null,
        sourceUrl: null,
      }));
    }

    const result = await analyzeGrants(companyContext, grants);

    if (!result) {
      return NextResponse.json(
        { ok: false, error: "El análisis IA no devolvió resultado." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        model: result.model,
        tokensUsed: result.tokensUsed,
        grantsAnalyzed: grants.length,
        results: result.results,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Error interno",
      },
      { status: 500 },
    );
  }
}
