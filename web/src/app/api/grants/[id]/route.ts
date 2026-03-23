import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type GrantDetail = {
    id: string;
    title: string;
    organization: string | null;
    publicationDate: string | null;
    description: string | null;
    sourceUrl: string | null;
};

function toDetail(raw: unknown, requestedNumConv: string): GrantDetail {
    const obj = (raw ?? {}) as Record<string, unknown>;

    const numeroConvocatoria =
        typeof obj.numeroConvocatoria === "string"
            ? obj.numeroConvocatoria
            : requestedNumConv;

    const sourceUrl = numeroConvocatoria
        ? `https://www.infosubvenciones.es/bdnstrans/GE/es/convocatoria/${encodeURIComponent(
            numeroConvocatoria
        )}`
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

export async function GET(
    _request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await context.params;

        // Base configurable; si no existe, usamos el host oficial por defecto.
        const base =
            process.env.BDNS_BASE_URL ?? "https://www.pap.hacienda.gob.es/bdnstrans/api";

        const normalizedBase = base.replace(/\/+$/, "");
        const url = new URL(`${normalizedBase}/convocatorias`);
        url.searchParams.set("numConv", id);
        url.searchParams.set("vpd", "GE");

        const res = await fetch(url.toString(), {
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

        const json = (await res.json()) as unknown;

        // En /convocatorias esperamos un objeto de detalle.
        if (!json || typeof json !== "object") {
            return NextResponse.json(
                { ok: false, error: "Respuesta de detalle inválida" },
                { status: 502 }
            );
        }

        return NextResponse.json({
            ok: true,
            data: toDetail(json, id),
        });
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