import Link from "next/link";
import { headers } from "next/headers";
import styles from "./page.module.css";

type GrantDetailResponse = {
  ok: boolean;
  data?: {
    id: string;
    title: string;
    organization: string | null;
    publicationDate: string | null;
    description: string | null;
    sourceUrl: string | null;
  };
  error?: string;
};

function getBaseUrlFromHeaders(h: Headers): string {
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export default async function GrantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const h = await headers();
  const baseUrl = getBaseUrlFromHeaders(h);

  const res = await fetch(`${baseUrl}/api/grants/${id}`, {
    cache: "no-store",
  });

  const json = (await res.json()) as GrantDetailResponse;

  if (!res.ok || !json.ok || !json.data) {
    return (
      <main className={styles.page}>
        <div className={styles.errorBox}>
          <p>Error cargando detalle: {json.error ?? "Desconocido"}</p>
          <Link href="/" className={styles.backLink}>
            Volver al buscador
          </Link>
        </div>
      </main>
    );
  }

  const grant = json.data;

  return (
    <main className={styles.page}>
      <article className={styles.card}>
        <Link href="/" className={styles.backLink}>
          ← Volver al buscador
        </Link>

        <h1 className={styles.title}>{grant.title}</h1>

        <div className={styles.meta}>
          <p>
            <strong>Organismo:</strong> {grant.organization ?? "No informado"}
          </p>
          <p>
            <strong>Fecha publicación:</strong>{" "}
            {grant.publicationDate ?? "No informada"}
          </p>
          <p>
            <strong>ID:</strong> {grant.id}
          </p>
        </div>

        <h2 className={styles.sectionTitle}>Descripción</h2>
        <p className={styles.description}>{grant.description ?? "Sin descripción"}</p>

        {grant.sourceUrl ? (
          <a
            className={styles.externalLink}
            href={grant.sourceUrl}
            target="_blank"
            rel="noreferrer"
          >
            Ver en portal oficial
          </a>
        ) : null}
      </article>
    </main>
  );
}