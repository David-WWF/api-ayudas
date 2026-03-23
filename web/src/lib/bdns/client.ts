type BdnsRawResponse = unknown;

export type GrantItem = {
  id: string;
  title: string;
  organization: string | null;
  publicationDate: string | null;
  deadlineDate: string | null;
  amount: number | null;
  sourceUrl: string | null;
};

export type GrantsSearchResult = {
  items: GrantItem[];
  total: number;
  page: number;
  pageSize: number;
};

function getEnvNumber(name: string, fallback: number): number {
  const value = process.env[name];
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildSearchUrl(
  endpoint: string,
  params: { q?: string; page: number; pageSize: number }
): string {
  const url = new URL(endpoint);

  // BDNS pagina desde 0, nuestra API expone page desde 1.
  const pageZeroBased = Math.max(0, params.page - 1);

  if (params.q) {
    // BDNS usa "descripcion" para búsqueda textual.
    url.searchParams.set("descripcion", params.q);
    // 2 = alguna de las palabras (más flexible para texto libre).
    url.searchParams.set("descripcionTipoBusqueda", "2");
  }

  url.searchParams.set("page", String(pageZeroBased));
  url.searchParams.set("pageSize", String(params.pageSize));

  // Portal general.
  url.searchParams.set("vpd", "GE");

  return url.toString();
}

async function fetchWithRetry(
  url: string,
  retries: number,
  timeoutMs: number
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
        },
        cache: "no-store",
      });

      clearTimeout(timeout);

      if (!res.ok) {
        if (res.status >= 500 && attempt < retries) continue;
        throw new Error(`BDNS respondió ${res.status}`);
      }

      return res;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt === retries) break;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Error desconocido consultando BDNS");
}

function normalizeRawToGrants(
  raw: BdnsRawResponse,
  page: number,
  pageSize: number
): GrantsSearchResult {
  const data = raw as { content?: unknown[]; totalElements?: unknown } | null;

  const rawItems = Array.isArray(data?.content) ? data.content : [];
  const total =
    typeof data?.totalElements === "number" ? data.totalElements : rawItems.length;

  const items: GrantItem[] = rawItems.map((item, idx) => {
    const obj = (item ?? {}) as Record<string, unknown>;

    const numeroConvocatoria =
      typeof obj.numeroConvocatoria === "string" ? obj.numeroConvocatoria : null;

    const sourceUrl = numeroConvocatoria
      ? `https://www.infosubvenciones.es/bdnstrans/GE/es/convocatoria/${encodeURIComponent(
          numeroConvocatoria
        )}`
      : null;

    return {
      id: String(obj.id ?? numeroConvocatoria ?? `unknown-${page}-${idx}`),
      title: typeof obj.descripcion === "string" ? obj.descripcion : "Sin título",
      organization: typeof obj.nivel2 === "string" ? obj.nivel2 : null,
      publicationDate:
        typeof obj.fechaRecepcion === "string" ? obj.fechaRecepcion : null,
      // En este endpoint listado no viene fecha límite ni cuantía.
      deadlineDate: null,
      amount: null,
      sourceUrl,
    };
  });

  return { items, total, page, pageSize };
}

export async function searchGrants(params: {
  q?: string;
  page: number;
  pageSize: number;
}): Promise<GrantsSearchResult> {
  const endpoint = process.env.BDNS_SEARCH_ENDPOINT;
  if (!endpoint) {
    throw new Error("BDNS_SEARCH_ENDPOINT no está configurado");
  }

  const timeoutMs = getEnvNumber("BDNS_TIMEOUT_MS", 12000);
  const retries = getEnvNumber("BDNS_RETRIES", 2);

  const url = buildSearchUrl(endpoint, params);
  const res = await fetchWithRetry(url, retries, timeoutMs);

  const raw = (await res.json()) as BdnsRawResponse;
  return normalizeRawToGrants(raw, params.page, params.pageSize);
}