import type { GrantDetail } from "@/lib/domain/grants";
import { buildInfosubvencionesConvocatoriaUrl, getBdnsApiBase } from "./urls";

function rawToGrantDetail(raw: unknown, requestedNumConv: string): GrantDetail {
  const obj = (raw ?? {}) as Record<string, unknown>;

  const numeroConvocatoria =
    typeof obj.numeroConvocatoria === "string" ? obj.numeroConvocatoria : requestedNumConv;

  const sourceUrl = numeroConvocatoria
    ? buildInfosubvencionesConvocatoriaUrl(numeroConvocatoria)
    : null;

  return {
    id: String(numeroConvocatoria ?? obj.id ?? "unknown"),
    title: typeof obj.descripcion === "string" ? obj.descripcion : "Sin título",
    organization: typeof obj.nivel2 === "string" ? obj.nivel2 : null,
    publicationDate:
      typeof obj.fechaRecepcion === "string" ? obj.fechaRecepcion : null,
    description: typeof obj.descripcion === "string" ? obj.descripcion : null,
    sourceUrl,
  };
}

export type FetchGrantDetailResult =
  | { ok: true; data: GrantDetail }
  | { ok: false; status: number; message: string };

/**
 * Detalle de convocatoria vía API BDNS (`/convocatorias?numConv=&vpd=GE`).
 */
export async function fetchGrantDetailByNumConv(numConv: string): Promise<FetchGrantDetailResult> {
  const url = new URL(`${getBdnsApiBase()}/convocatorias`);
  url.searchParams.set("numConv", numConv);
  url.searchParams.set("vpd", "GE");

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      message: `BDNS respondió ${res.status}`,
    };
  }

  const json = (await res.json()) as unknown;
  if (!json || typeof json !== "object") {
    return { ok: false, status: 502, message: "Respuesta de detalle inválida" };
  }

  return { ok: true, data: rawToGrantDetail(json, numConv) };
}
