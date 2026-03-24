"use client";

import { FormEvent, useEffect, useState } from "react";

type AlertFilters = {
  searchText: string;
  tipoAdministracion: "C" | "A" | "L" | "O" | null;
  regionId: number | null;
  fechaDesde: string | null;
  fechaHasta: string | null;
  orderBy:
    | "numeroConvocatoria"
    | "mrr"
    | "nivel1"
    | "nivel2"
    | "nivel3"
    | "fechaRecepcion"
    | "descripcion"
    | "descripcionLeng";
  direccion: "asc" | "desc";
};

type AlertProfile = {
  id: number;
  name: string;
  enabled: boolean;
  filters: AlertFilters;
  scheduleCron: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type ProfilesResponse = {
  ok: boolean;
  data?: AlertProfile[];
  error?: string;
};

export default function AlertsSettingsPage() {
  const [profiles, setProfiles] = useState<AlertProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [name, setName] = useState("Nueva alerta");
  const [searchText, setSearchText] = useState("");
  const [tipoAdministracion, setTipoAdministracion] = useState("");
  const [regionId, setRegionId] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  async function loadProfiles() {
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/settings/alert-profiles", { cache: "no-store" });
      const json = (await res.json()) as ProfilesResponse;

      if (!res.ok || !json.ok || !Array.isArray(json.data)) {
        throw new Error(json.error ?? "No se pudieron cargar los perfiles");
      }

      setProfiles(json.data);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Error cargando perfiles");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProfiles();
  }, []);

  async function onCreateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const body = {
        name: name.trim(),
        enabled: true,
        scheduleCron: "0 9 * * 1",
        filters: {
          searchText,
          tipoAdministracion: tipoAdministracion || null,
          regionId: regionId ? Number(regionId) : null,
          fechaDesde: fechaDesde || null,
          fechaHasta: fechaHasta || null,
          orderBy: "fechaRecepcion",
          direccion: "desc",
        },
      };

      const res = await fetch("/api/settings/alert-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = (await res.json()) as { ok: boolean; error?: string };

      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "No se pudo crear el perfil");
      }

      setName("Nueva alerta");
      setSearchText("");
      setTipoAdministracion("");
      setRegionId("");
      setFechaDesde("");
      setFechaHasta("");
      setMessage("Perfil creado correctamente.");
      await loadProfiles();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Error creando perfil");
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(profile: AlertProfile) {
    setMessage(null);

    try {
      const res = await fetch(`/api/settings/alert-profiles/${profile.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profile.name,
          enabled: !profile.enabled,
          scheduleCron: profile.scheduleCron ?? "0 9 * * 1",
          filters: profile.filters,
        }),
      });

      const json = (await res.json()) as { ok: boolean; error?: string };

      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "No se pudo actualizar el perfil");
      }

      await loadProfiles();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Error actualizando perfil");
    }
  }

  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: 24 }}>
      <h1 style={{ marginBottom: 12 }}>Gestión de alertas</h1>
      <p style={{ marginBottom: 20 }}>
        Crea y administra perfiles de alerta semanales (multi-alerta).
      </p>

      <form
        onSubmit={onCreateProfile}
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 14,
          marginBottom: 16,
        }}
      >
        <h2 style={{ marginBottom: 10 }}>Nuevo perfil</h2>

        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
          <input
            placeholder="Nombre del perfil"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            placeholder="Texto de búsqueda (ej. innovación)"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />

          <select
            value={tipoAdministracion}
            onChange={(e) => setTipoAdministracion(e.target.value)}
          >
            <option value="">Administración: todas</option>
            <option value="C">Estado</option>
            <option value="A">Comunidad Autónoma</option>
            <option value="L">Entidad Local</option>
            <option value="O">Otros</option>
          </select>

          <input
            type="number"
            placeholder="Region ID (opcional, ej. 26 Madrid)"
            value={regionId}
            onChange={(e) => setRegionId(e.target.value)}
          />

          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
          />
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
          />
        </div>

        <button type="submit" disabled={saving} style={{ marginTop: 12 }}>
          {saving ? "Guardando..." : "Crear perfil"}
        </button>
      </form>

      <section>
        <h2 style={{ marginBottom: 10 }}>Perfiles existentes</h2>
        {loading ? <p>Cargando...</p> : null}

        {!loading && profiles.length === 0 ? <p>No hay perfiles creados todavía.</p> : null}

        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
          {profiles.map((p) => (
            <li
              key={p.id}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                padding: 12,
              }}
            >
              <strong>{p.name}</strong>
              <p style={{ marginTop: 6 }}>
                Estado: {p.enabled ? "Activo" : "Inactivo"} | Texto:{" "}
                {p.filters.searchText || "(vacío)"} | Admin:{" "}
                {p.filters.tipoAdministracion ?? "todas"} | Región:{" "}
                {p.filters.regionId ?? "todas"}
              </p>
              <button type="button" onClick={() => void toggleEnabled(p)}>
                {p.enabled ? "Desactivar" : "Activar"}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {message ? <p style={{ marginTop: 14 }}>{message}</p> : null}
    </main>
  );
}