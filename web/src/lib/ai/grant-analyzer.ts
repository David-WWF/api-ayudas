import OpenAI from "openai";
import type { GrantItem } from "@/lib/domain/grants";

/* ------------------------------------------------------------------ */
/*  Tipos                                                              */
/* ------------------------------------------------------------------ */

export type AiRelevance = "alta" | "media" | "baja";

export type GrantAiResult = {
  grantId: string;
  relevance: AiRelevance;
  reason: string;
};

export type AnalyzeGrantsResult = {
  results: GrantAiResult[];
  model: string;
  tokensUsed: number;
};

/* ------------------------------------------------------------------ */
/*  Configuración por env                                              */
/* ------------------------------------------------------------------ */

function getConfig() {
  const apiKey = process.env.OPENAI_API_KEY ?? "";
  const model = process.env.AI_MODEL ?? "gpt-4o-mini";
  const maxGrants = Math.max(
    1,
    Number(process.env.AI_MAX_GRANTS_PER_CALL) || 30,
  );
  return { apiKey, model, maxGrants };
}

export function isAiConfigured(): boolean {
  return (process.env.OPENAI_API_KEY ?? "").length > 0;
}

/* ------------------------------------------------------------------ */
/*  Prompt                                                             */
/* ------------------------------------------------------------------ */

function buildPrompt(companyContext: string, grants: GrantItem[]): string {
  const grantsBlock = grants
    .map((g) => {
      const parts = [`- id: ${g.id}`, `  título: ${g.title}`];
      if (g.organization) parts.push(`  organismo: ${g.organization}`);
      if (g.publicationDate) parts.push(`  publicación: ${g.publicationDate}`);
      if (g.amount) parts.push(`  importe: ${g.amount} €`);
      if (g.beneficiaryTypes?.length) parts.push(`  beneficiario elegible: ${g.beneficiaryTypes.join("; ")}`);
      if (g.sectors?.length) parts.push(`  sector económico: ${g.sectors.join("; ")}`);
      if (g.impactRegions?.length) parts.push(`  región de impacto: ${g.impactRegions.join("; ")}`);
      if (g.purpose) parts.push(`  finalidad: ${g.purpose}`);
      if (g.instrumentType) parts.push(`  instrumento: ${g.instrumentType}`);
      return parts.join("\n");
    })
    .join("\n");

  return `Eres un analista experto en subvenciones y ayudas públicas españolas.

CONTEXTO DE LA EMPRESA:
${companyContext}

CONVOCATORIAS NUEVAS:
${grantsBlock}

TAREA:
Para cada convocatoria, clasifica su relevancia para la empresa descrita arriba.
Devuelve ÚNICAMENTE un JSON válido (sin markdown, sin explicación fuera del JSON) con esta estructura:

[
  { "grantId": "<id>", "relevance": "alta|media|baja", "reason": "<1 frase corta>" }
]

CRITERIOS:
- "alta": la empresa cumple requisitos principales (tipo de beneficiario, sector, región) y el objeto encaja con su actividad.
- "media": podría encajar pero faltan datos o el encaje es parcial.
- "baja": no encaja con el perfil de la empresa (tipo de beneficiario incompatible, sector/región distinto, etc.).

IMPORTANTE: si el "beneficiario elegible" no incluye el tipo de entidad de la empresa (ej. la ayuda es solo para personas físicas y la empresa es una sociedad), clasifica como "baja" y explica el motivo.

Responde SOLO con el array JSON.`;
}

/* ------------------------------------------------------------------ */
/*  Función principal                                                  */
/* ------------------------------------------------------------------ */

/**
 * Analiza convocatorias con IA. Devuelve `null` si la IA no está configurada
 * o si no hay perfil de empresa (degradación limpia).
 */
export async function analyzeGrants(
  companyContext: string,
  grants: GrantItem[],
): Promise<AnalyzeGrantsResult | null> {
  const { apiKey, model, maxGrants } = getConfig();

  if (!apiKey) return null;
  if (!companyContext.trim()) return null;
  if (grants.length === 0) return null;

  const subset = grants.slice(0, maxGrants);

  const openai = new OpenAI({ apiKey });

  const completion = await openai.chat.completions.create({
    model,
    temperature: 0.2,
    messages: [
      { role: "system", content: "Responde siempre en español. Solo JSON, sin markdown." },
      { role: "user", content: buildPrompt(companyContext, subset) },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "[]";
  const tokensUsed = completion.usage?.total_tokens ?? 0;

  const parsed = parseAiResponse(raw, subset);

  return { results: parsed, model, tokensUsed };
}

/* ------------------------------------------------------------------ */
/*  Parser robusto de la respuesta                                     */
/* ------------------------------------------------------------------ */

const VALID_RELEVANCE = new Set<AiRelevance>(["alta", "media", "baja"]);

function parseAiResponse(raw: string, grants: GrantItem[]): GrantAiResult[] {
  const validIds = new Set(grants.map((g) => g.id));

  try {
    const cleaned = raw
      .replace(/^```json?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    const arr: unknown[] = JSON.parse(cleaned);

    if (!Array.isArray(arr)) return fallbackResults(grants);

    const mapped: GrantAiResult[] = [];

    for (const item of arr) {
      if (typeof item !== "object" || item === null) continue;
      const obj = item as Record<string, unknown>;

      const grantId = String(obj.grantId ?? "");
      if (!validIds.has(grantId)) continue;

      const relevance = VALID_RELEVANCE.has(obj.relevance as AiRelevance)
        ? (obj.relevance as AiRelevance)
        : "media";

      const reason = typeof obj.reason === "string" ? obj.reason.slice(0, 300) : "";

      mapped.push({ grantId, relevance, reason });
    }

    if (mapped.length === 0) return fallbackResults(grants);
    return mapped;
  } catch {
    return fallbackResults(grants);
  }
}

function fallbackResults(grants: GrantItem[]): GrantAiResult[] {
  return grants.map((g) => ({
    grantId: g.id,
    relevance: "media" as AiRelevance,
    reason: "No se pudo determinar la relevancia automáticamente.",
  }));
}
