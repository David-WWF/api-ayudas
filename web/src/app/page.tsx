"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";

type GrantItem = {
  id: string;
  title: string;
  organization: string | null;
  publicationDate: string | null;
  deadlineDate: string | null;
  amount: number | null;
  sourceUrl: string | null;
};

type GrantsResponse = {
  ok: boolean;
  data?: {
    items: GrantItem[];
    total: number;
    page: number;
    pageSize: number;
  };
  error?: string;
};

const PAGE_SIZE = 10;

export default function Home() {
  const [queryInput, setQueryInput] = useState("ayuda");
  const [fechaDesdeInput, setFechaDesdeInput] = useState("");
  const [fechaHastaInput, setFechaHastaInput] = useState("");
  const [tipoAdminInput, setTipoAdminInput] = useState("");

  const [query, setQuery] = useState("ayuda");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [tipoAdmin, setTipoAdmin] = useState("");

  const [page, setPage] = useState(1);
  const [items, setItems] = useState<GrantItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  const [orderInput, setOrderInput] = useState("fechaRecepcion");
  const [direccionInput, setDireccionInput] = useState<"asc" | "desc">("desc");

  const [order, setOrder] = useState("fechaRecepcion");
  const [direccion, setDireccion] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    const controller = new AbortController();

    async function loadGrants() {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(PAGE_SIZE),
        });

        if (query.trim()) params.set("q", query.trim());
        if (fechaDesde) params.set("fechaDesde", fechaDesde);
        if (fechaHasta) params.set("fechaHasta", fechaHasta);
        if (tipoAdmin) params.set("tipoAdministracion", tipoAdmin);

        if (order) params.set("order", order);
        if (direccion) params.set("direccion", direccion);

        const res = await fetch(`/api/grants/search?${params.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });

        const json = (await res.json()) as GrantsResponse;

        if (!res.ok || !json.ok || !json.data) {
          throw new Error(json.error ?? "No se pudo obtener el listado");
        }

        setItems(json.data.items);
        setTotal(json.data.total);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Error inesperado");
        setItems([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    }

    loadGrants();
    return () => controller.abort();
  }, [query, page, fechaDesde, fechaHasta, tipoAdmin, order, direccion]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (fechaDesdeInput && fechaHastaInput && fechaDesdeInput > fechaHastaInput) {
      setError("La fecha 'desde' no puede ser mayor que la fecha 'hasta'.");
      return;
    }

    setPage(1);
    setQuery(queryInput);
    setFechaDesde(fechaDesdeInput);
    setFechaHasta(fechaHastaInput);
    setTipoAdmin(tipoAdminInput);
    setOrder(orderInput);
    setDireccion(direccionInput);
  }

  function onClearFilters() {
    setQueryInput("");
    setFechaDesdeInput("");
    setFechaHastaInput("");
    setTipoAdminInput("");

    setQuery("");
    setFechaDesde("");
    setFechaHasta("");
    setTipoAdmin("");
    setPage(1);

    setOrderInput("fechaRecepcion");
    setDireccionInput("desc");
    setOrder("fechaRecepcion");
    setDireccion("desc");

    setError(null);
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.header}>
          <h1>Buscador interno de ayudas</h1>
          <p>Consulta convocatorias públicas desde BDNS a través de tu API interna.</p>
        </header>

        <form className={styles.searchForm} onSubmit={onSubmit}>
          <div className={styles.filtersGrid}>
            <div className={styles.field}>
              <label htmlFor="q">Texto</label>
              <input
                id="q"
                type="text"
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                placeholder='Ejemplo: "digitalización", "autónomos", "I+D"'
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="fechaDesde">Fecha desde</label>
              <input
                id="fechaDesde"
                type="date"
                value={fechaDesdeInput}
                onChange={(e) => setFechaDesdeInput(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="fechaHasta">Fecha hasta</label>
              <input
                id="fechaHasta"
                type="date"
                value={fechaHastaInput}
                onChange={(e) => setFechaHastaInput(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="tipoAdministracion">Administración</label>
              <select
                id="tipoAdministracion"
                value={tipoAdminInput}
                onChange={(e) => setTipoAdminInput(e.target.value)}
              >
                <option value="">Todas</option>
                <option value="C">Estado (C)</option>
                <option value="A">Comunidad Autónoma (A)</option>
                <option value="L">Entidad Local (L)</option>
                <option value="O">Otros órganos (O)</option>
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor="order">Ordenar por</label>
              <select
                id="order"
                value={orderInput}
                onChange={(e) => setOrderInput(e.target.value)}
              >
                <option value="fechaRecepcion">Fecha publicación</option>
                <option value="descripcion">Título</option>
                <option value="nivel2">Organismo</option>
                <option value="numeroConvocatoria">Nº convocatoria</option>
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor="direccion">Dirección</label>
              <select
                id="direccion"
                value={direccionInput}
                onChange={(e) => setDireccionInput(e.target.value as "asc" | "desc")}
              >
                <option value="desc">Descendente</option>
                <option value="asc">Ascendente</option>
              </select>
            </div>
          </div>

          <div className={styles.actions}>
            <button type="submit" disabled={loading}>
              {loading ? "Buscando..." : "Aplicar filtros"}
            </button>

            <button
              type="button"
              className={styles.secondaryButton}
              onClick={onClearFilters}
              disabled={loading}
            >
              Limpiar
            </button>
          </div>
        </form>

        <section className={styles.meta}>
          <span>
            {loading
              ? "Cargando resultados..."
              : `Mostrando ${items.length} resultados de ${total} totales`}
          </span>
          <span>
            Página {page} de {totalPages}
          </span>
        </section>

        {error ? <p className={styles.error}>Error: {error}</p> : null}

        {!loading && !error && items.length === 0 ? (
          <p className={styles.empty}>No hay resultados para esta búsqueda/filtros.</p>
        ) : null}

        <ul className={styles.list}>
          {items.map((grant) => (
            <li key={grant.id} className={styles.card}>
              <h2>{grant.title}</h2>

              <p>
                <strong>Organismo:</strong> {grant.organization ?? "No informado"}
              </p>

              <p>
                <strong>Publicación:</strong> {grant.publicationDate ?? "No informada"}
              </p>

              <p className={styles.cardActions}>
                <Link href={`/grants/${grant.id}`}>Ver detalle interno</Link>
              </p>

              {grant.sourceUrl ? (
                <a href={grant.sourceUrl} target="_blank" rel="noreferrer">
                  Ver convocatoria en portal oficial
                </a>
              ) : (
                <span className={styles.noLink}>Sin enlace disponible</span>
              )}
            </li>
          ))}
        </ul>

        <nav className={styles.pagination}>
          <button
            type="button"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={loading || page <= 1}
          >
            Anterior
          </button>

          <button
            type="button"
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={loading || page >= totalPages}
          >
            Siguiente
          </button>
        </nav>
      </main>
    </div>
  );
}