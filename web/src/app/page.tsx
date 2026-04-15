"use client";

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

type RegionOption = { id: number; name: string };

type GrantDetail = {
  id: string;
  title: string;
  organization: string | null;
  publicationDate: string | null;
  description: string | null;
  sourceUrl: string | null;
};

type GrantDetailResponse = {
  ok: boolean;
  data?: GrantDetail;
  error?: string;
};

type GlobalFiltersResponse = {
  ok: boolean;
  data?: {
    searchText: string;
    tipoAdministracion: string | null;
    regionId: number | null;
    fechaDesde: string | null;
    fechaHasta: string | null;
    orderBy: string;
    direccion: "asc" | "desc";
    updatedAt: string | null;
  };
  error?: string;
};

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

type AlertProfilesResponse = {
  ok: boolean;
  data?: AlertProfile[];
  error?: string;
};

type NotificationRecipient = {
  id: number;
  channel: "email" | "telegram";
  address: string;
  label: string | null;
  enabled: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

type NotificationRecipientsResponse = {
  ok: boolean;
  data?: NotificationRecipient[];
  error?: string;
};

const PAGE_SIZE = 10;

export default function Home() {
  const [queryInput, setQueryInput] = useState("ayuda");
  const [fechaDesdeInput, setFechaDesdeInput] = useState("");
  const [fechaHastaInput, setFechaHastaInput] = useState("");
  const [tipoAdminInput, setTipoAdminInput] = useState("");
  const [orderInput, setOrderInput] = useState("fechaRecepcion");
  const [direccionInput, setDireccionInput] = useState<"asc" | "desc">("desc");
  const [regionIdInput, setRegionIdInput] = useState<number | "">("");

  const [query, setQuery] = useState("ayuda");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [tipoAdmin, setTipoAdmin] = useState("");
  const [order, setOrder] = useState("fechaRecepcion");
  const [direccion, setDireccion] = useState<"asc" | "desc">("desc");
  const [regionId, setRegionId] = useState<number | undefined>(undefined);

  const [regions, setRegions] = useState<RegionOption[]>([]);

  const [page, setPage] = useState(1);
  const [items, setItems] = useState<GrantItem[]>([]);
  const [total, setTotal] = useState(0);

  const [loading, setLoading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<GrantDetail | null>(null);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  const [profilesModalOpen, setProfilesModalOpen] = useState(false);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [profilesSaving, setProfilesSaving] = useState(false);
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<AlertProfile[]>([]);
  const [profileBusyId, setProfileBusyId] = useState<number | null>(null);
  const [editingProfileId, setEditingProfileId] = useState<number | null>(null);

  const [recipientsLoading, setRecipientsLoading] = useState(false);
  const [recipientsError, setRecipientsError] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<NotificationRecipient[]>([]);
  const [recipientBusyId, setRecipientBusyId] = useState<number | null>(null);
  const [recipientSaving, setRecipientSaving] = useState(false);
  const [newRecipientChannel, setNewRecipientChannel] = useState<"email" | "telegram">(
    "email"
  );
  const [newRecipientAddress, setNewRecipientAddress] = useState("");
  const [newRecipientLabel, setNewRecipientLabel] = useState("");

  // Perfil de empresa (contexto para análisis IA)
  const [companyContext, setCompanyContext] = useState("");
  const [companyContextSaved, setCompanyContextSaved] = useState("");
  const [companyContextLoading, setCompanyContextLoading] = useState(false);
  const [companyContextSaving, setCompanyContextSaving] = useState(false);
  const [companyContextMsg, setCompanyContextMsg] = useState<string | null>(null);

  // Form nuevo perfil
  const [newProfileName, setNewProfileName] = useState("Nueva alerta");
  const [newProfileSearch, setNewProfileSearch] = useState("");
  const [newProfileTipoAdmin, setNewProfileTipoAdmin] = useState("");
  const [newProfileRegionId, setNewProfileRegionId] = useState("");
  const [newProfileFechaDesde, setNewProfileFechaDesde] = useState("");
  const [newProfileFechaHasta, setNewProfileFechaHasta] = useState("");

  const regionsById = useMemo(() => {
    const map = new Map<number, string>();
    for (const region of regions) {
      map.set(region.id, region.name);
    }
    return map;
  }, [regions]);

  // Carga catálogo de comunidades autónomas
  useEffect(() => {
    let mounted = true;

    async function loadRegions() {
      try {
        const res = await fetch("/api/catalogs/regions", { cache: "no-store" });
        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) return;

        const json = (await res.json()) as { ok: boolean; data?: RegionOption[] };
        if (!mounted) return;

        if (res.ok && json.ok && Array.isArray(json.data)) {
          setRegions(json.data);
        }
      } catch {
        // No bloquea la pantalla
      }
    }

    void loadRegions();

    return () => {
      mounted = false;
    };
  }, []);

  // Carga perfil global persistido
  useEffect(() => {
    let mounted = true;

    async function loadGlobalFilters() {
      try {
        const res = await fetch("/api/settings/global-filters", { cache: "no-store" });
        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) return;

        const json = (await res.json()) as GlobalFiltersResponse;
        if (!mounted) return;
        if (!res.ok || !json.ok || !json.data) return;

        const data = json.data;

        const nextQuery = data.searchText ?? "";
        const nextTipoAdmin = data.tipoAdministracion ?? "";
        const nextRegionId = typeof data.regionId === "number" ? data.regionId : "";
        const nextFechaDesde = data.fechaDesde ?? "";
        const nextFechaHasta = data.fechaHasta ?? "";
        const nextOrder =
          typeof data.orderBy === "string" && data.orderBy.length > 0
            ? data.orderBy
            : "fechaRecepcion";
        const nextDireccion = data.direccion === "asc" ? "asc" : "desc";

        // Input state
        setQueryInput(nextQuery);
        setTipoAdminInput(nextTipoAdmin);
        setRegionIdInput(nextRegionId);
        setFechaDesdeInput(nextFechaDesde);
        setFechaHastaInput(nextFechaHasta);
        setOrderInput(nextOrder);
        setDireccionInput(nextDireccion);

        // Applied state
        setQuery(nextQuery);
        setTipoAdmin(nextTipoAdmin);
        setRegionId(typeof nextRegionId === "number" ? nextRegionId : undefined);
        setFechaDesde(nextFechaDesde);
        setFechaHasta(nextFechaHasta);
        setOrder(nextOrder);
        setDireccion(nextDireccion);

        setPage(1);
      } catch {
        // No bloquea la pantalla
      }
    }

    void loadGlobalFilters();

    return () => {
      mounted = false;
    };
  }, []);

  // Carga listado
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
        if (typeof regionId === "number") params.set("regionId", String(regionId));

        const res = await fetch(`/api/grants/search?${params.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });

        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) {
          throw new Error("La API de búsqueda no devolvió JSON válido");
        }

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

    void loadGrants();
    return () => controller.abort();
  }, [query, page, fechaDesde, fechaHasta, tipoAdmin, order, direccion, regionId]);

  async function handleOpenDetail(grantId: string) {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError(null);
    setDetailData(null);

    try {
      const res = await fetch(`/api/grants/${grantId}`, { cache: "no-store" });
      const contentType = res.headers.get("content-type") ?? "";

      if (!contentType.includes("application/json")) {
        throw new Error("La respuesta de detalle no es JSON");
      }

      const json = (await res.json()) as GrantDetailResponse;

      if (!res.ok || !json.ok || !json.data) {
        throw new Error(json.error ?? "No se pudo cargar el detalle");
      }

      setDetailData(json.data);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Error cargando detalle");
    } finally {
      setDetailLoading(false);
    }
  }
  async function loadProfiles() {
    setProfilesLoading(true);
    setProfilesError(null);

    try {
      const res = await fetch("/api/settings/alert-profiles", { cache: "no-store" });
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error("La API de perfiles no devolvió JSON válido");
      }

      const json = (await res.json()) as AlertProfilesResponse;

      if (!res.ok || !json.ok || !Array.isArray(json.data)) {
        throw new Error(json.error ?? "No se pudieron cargar los perfiles");
      }

      setProfiles(json.data);
    } catch (err) {
      setProfilesError(err instanceof Error ? err.message : "Error cargando perfiles");
    } finally {
      setProfilesLoading(false);
    }
  }

  async function loadRecipients() {
    setRecipientsLoading(true);
    setRecipientsError(null);

    try {
      const res = await fetch("/api/settings/notification-recipients", { cache: "no-store" });
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error("La API de destinatarios no devolvió JSON válido");
      }

      const json = (await res.json()) as NotificationRecipientsResponse;

      if (!res.ok || !json.ok || !Array.isArray(json.data)) {
        throw new Error(json.error ?? "No se pudieron cargar los destinatarios");
      }

      setRecipients(json.data);
    } catch (err) {
      setRecipientsError(err instanceof Error ? err.message : "Error cargando destinatarios");
    } finally {
      setRecipientsLoading(false);
    }
  }

  async function loadCompanyProfile() {
    setCompanyContextLoading(true);
    setCompanyContextMsg(null);
    try {
      const res = await fetch("/api/settings/company-profile", { cache: "no-store" });
      const json = (await res.json()) as { ok: boolean; data?: { contextText: string }; error?: string };
      if (res.ok && json.ok && json.data) {
        setCompanyContext(json.data.contextText);
        setCompanyContextSaved(json.data.contextText);
      }
    } catch {
      // no bloquea
    } finally {
      setCompanyContextLoading(false);
    }
  }

  async function saveCompanyProfile() {
    setCompanyContextSaving(true);
    setCompanyContextMsg(null);
    try {
      const res = await fetch("/api/settings/company-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contextText: companyContext }),
      });
      const json = (await res.json()) as { ok: boolean; data?: { contextText: string }; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Error guardando perfil de empresa");
      if (json.data) {
        setCompanyContext(json.data.contextText);
        setCompanyContextSaved(json.data.contextText);
      }
      setCompanyContextMsg("Perfil de empresa guardado.");
    } catch (err) {
      setCompanyContextMsg(err instanceof Error ? err.message : "Error guardando perfil de empresa");
    } finally {
      setCompanyContextSaving(false);
    }
  }

  async function createRecipient() {
    const addr = newRecipientAddress.trim();
    if (!addr) {
      setRecipientsError("Indica un correo o un chat ID de Telegram.");
      return;
    }

    setRecipientSaving(true);
    setRecipientsError(null);

    try {
      const res = await fetch("/api/settings/notification-recipients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: newRecipientChannel,
          address: addr,
          label: newRecipientLabel.trim() || null,
          enabled: true,
        }),
      });

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error("La API de destinatarios no devolvió JSON válido");
      }

      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "No se pudo añadir el destinatario");
      }

      setNewRecipientAddress("");
      setNewRecipientLabel("");
      await loadRecipients();
    } catch (err) {
      setRecipientsError(err instanceof Error ? err.message : "Error añadiendo destinatario");
    } finally {
      setRecipientSaving(false);
    }
  }

  async function toggleRecipientEnabled(r: NotificationRecipient) {
    setRecipientBusyId(r.id);
    setRecipientsError(null);

    try {
      const res = await fetch(`/api/settings/notification-recipients/${r.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: r.label,
          enabled: !r.enabled,
          address: r.address,
          channel: r.channel,
        }),
      });

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error("La API de destinatarios no devolvió JSON válido");
      }

      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "No se pudo actualizar");
      }

      await loadRecipients();
    } catch (err) {
      setRecipientsError(err instanceof Error ? err.message : "Error actualizando destinatario");
    } finally {
      setRecipientBusyId(null);
    }
  }

  async function deleteRecipient(id: number) {
    const confirmed = window.confirm("¿Eliminar este destinatario?");
    if (!confirmed) return;

    setRecipientBusyId(id);
    setRecipientsError(null);

    try {
      const res = await fetch(`/api/settings/notification-recipients/${id}`, {
        method: "DELETE",
      });

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error("La API de destinatarios no devolvió JSON válido");
      }

      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "No se pudo eliminar");
      }

      await loadRecipients();
    } catch (err) {
      setRecipientsError(err instanceof Error ? err.message : "Error eliminando destinatario");
    } finally {
      setRecipientBusyId(null);
    }
  }

  async function createProfile() {
    const trimmedName = newProfileName.trim();
    if (!trimmedName) {
      setProfilesError("El nombre del perfil es obligatorio.");
      return;
    }

    setProfilesSaving(true);
    setProfilesError(null);

    try {
      const payload = {
        name: trimmedName,
        enabled: true,
        scheduleCron: "0 9 * * 1",
        filters: {
          searchText: newProfileSearch,
          tipoAdministracion: newProfileTipoAdmin || null,
          regionId:
            newProfileTipoAdmin === "A" && newProfileRegionId
              ? Number(newProfileRegionId)
              : null,
          fechaDesde: newProfileFechaDesde || null,
          fechaHasta: newProfileFechaHasta || null,
          orderBy: "fechaRecepcion",
          direccion: "desc",
        },
      };

      const res = await fetch("/api/settings/alert-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error("La API de perfiles no devolvió JSON válido");
      }

      const json = (await res.json()) as { ok: boolean; error?: string };

      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "No se pudo crear el perfil");
      }

      setNewProfileName("Nueva alerta");
      setNewProfileSearch("");
      setNewProfileTipoAdmin("");
      setNewProfileRegionId("");
      setNewProfileFechaDesde("");
      setNewProfileFechaHasta("");

      await loadProfiles();
    } catch (err) {
      setProfilesError(err instanceof Error ? err.message : "Error creando perfil");
    } finally {
      setProfilesSaving(false);
    }
  }

  async function toggleProfileEnabled(profile: AlertProfile) {
    setProfilesError(null);
    setProfileBusyId(profile.id);

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

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error("La API de perfiles no devolvió JSON válido");
      }

      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "No se pudo actualizar el perfil");
      }

      await loadProfiles();
    } catch (err) {
      setProfilesError(err instanceof Error ? err.message : "Error actualizando perfil");
    } finally {
      setProfileBusyId(null);
    }
  }

  async function saveProfileFull(profile: AlertProfile) {
    const trimmedName = profile.name.trim();
    if (!trimmedName) {
      setProfilesError("El nombre del perfil no puede estar vacío.");
      return;
    }

    setProfilesError(null);
    setProfileBusyId(profile.id);

    try {
      const res = await fetch(`/api/settings/alert-profiles/${profile.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          enabled: profile.enabled,
          scheduleCron: profile.scheduleCron ?? "0 9 * * 1",
          filters: profile.filters,
        }),
      });

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error("La API de perfiles no devolvió JSON válido");
      }

      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "No se pudo guardar el perfil");
      }

      setEditingProfileId(null);
      await loadProfiles();
    } catch (err) {
      setProfilesError(err instanceof Error ? err.message : "Error guardando perfil");
    } finally {
      setProfileBusyId(null);
    }
  }

  async function deleteProfile(profileId: number) {
    const confirmed = window.confirm("¿Seguro que quieres eliminar este perfil?");
    if (!confirmed) return;

    setProfilesError(null);
    setProfileBusyId(profileId);

    try {
      const res = await fetch(`/api/settings/alert-profiles/${profileId}`, {
        method: "DELETE",
      });

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error("La API de perfiles no devolvió JSON válido");
      }

      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "No se pudo eliminar el perfil");
      }

      await loadProfiles();
    } catch (err) {
      setProfilesError(err instanceof Error ? err.message : "Error eliminando perfil");
    } finally {
      setProfileBusyId(null);
    }
  }

  function handleCloseDetail() {
    setDetailOpen(false);
    setDetailLoading(false);
    setDetailError(null);
    setDetailData(null);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (fechaDesdeInput && fechaHastaInput && fechaDesdeInput > fechaHastaInput) {
      setError("La fecha 'desde' no puede ser mayor que la fecha 'hasta'.");
      return;
    }

    setError(null);
    setProfileMessage(null);
    setPage(1);

    setQuery(queryInput);
    setFechaDesde(fechaDesdeInput);
    setFechaHasta(fechaHastaInput);
    setTipoAdmin(tipoAdminInput);
    setOrder(orderInput);
    setDireccion(direccionInput);
    setRegionId(typeof regionIdInput === "number" ? regionIdInput : undefined);
  }

  function onClearFilters() {
    setQueryInput("");
    setFechaDesdeInput("");
    setFechaHastaInput("");
    setTipoAdminInput("");
    setOrderInput("fechaRecepcion");
    setDireccionInput("desc");
    setRegionIdInput("");

    setQuery("");
    setFechaDesde("");
    setFechaHasta("");
    setTipoAdmin("");
    setOrder("fechaRecepcion");
    setDireccion("desc");
    setRegionId(undefined);

    setPage(1);
    setError(null);
    setProfileMessage(null);
  }

  async function handleSaveGlobalProfile() {
    setSavingProfile(true);
    setProfileMessage(null);

    try {
      const payload = {
        searchText: queryInput,
        tipoAdministracion: tipoAdminInput || null,
        regionId: typeof regionIdInput === "number" ? regionIdInput : null,
        fechaDesde: fechaDesdeInput || null,
        fechaHasta: fechaHastaInput || null,
        orderBy: orderInput,
        direccion: direccionInput,
      };

      const res = await fetch("/api/settings/global-filters", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error("La API de configuración no devolvió JSON válido");
      }

      const json = (await res.json()) as GlobalFiltersResponse;

      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "No se pudo guardar el perfil global");
      }

      setProfileMessage("Perfil global guardado correctamente.");
    } catch (err) {
      setProfileMessage(
        err instanceof Error ? err.message : "Error guardando perfil global."
      );
    } finally {
      setSavingProfile(false);
    }
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.header}>
          <h1>Buscador interno de ayudas</h1>
          <p>Consulta convocatorias públicas desde BDNS a través de tu API interna.</p>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.manageAlertsButton}
              onClick={() => {
                setProfilesModalOpen(true);
                void loadProfiles();
                void loadRecipients();
                void loadCompanyProfile();
              }}
            >
              <svg
                className={styles.manageAlertsIcon}
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M12 3a6 6 0 0 0-6 6v3.6l-1.4 2.8a1 1 0 0 0 .9 1.6h13a1 1 0 0 0 .9-1.6L18 12.6V9a6 6 0 0 0-6-6Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M9.5 18a2.5 2.5 0 0 0 5 0"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>Gestionar alertas</span>
            </button>
          </div>
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
                onChange={(e) => {
                  const value = e.target.value;

                  if (fechaHastaInput && value && value > fechaHastaInput) {
                    setError("La fecha 'desde' no puede ser mayor que la fecha 'hasta'.");
                    return;
                  }

                  setError(null);
                  setFechaDesdeInput(value);
                  setFechaDesde(value);
                  setPage(1);
                }}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="fechaHasta">Fecha hasta</label>
              <input
                id="fechaHasta"
                type="date"
                value={fechaHastaInput}
                onChange={(e) => {
                  const value = e.target.value;

                  if (fechaDesdeInput && value && value < fechaDesdeInput) {
                    setError("La fecha 'hasta' no puede ser menor que la fecha 'desde'.");
                    return;
                  }

                  setError(null);
                  setFechaHastaInput(value);
                  setFechaHasta(value);
                  setPage(1);
                }}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="tipoAdministracion">Administración</label>
              <select
                id="tipoAdministracion"
                value={tipoAdminInput}
                onChange={(e) => {
                  const value = e.target.value;
                  setTipoAdminInput(value);
                  setTipoAdmin(value);

                  if (value !== "A") {
                    setRegionIdInput("");
                    setRegionId(undefined);
                  }

                  setPage(1);
                }}
              >
                <option value="">Todas</option>
                <option value="C">Estado (C)</option>
                <option value="A">Comunidad Autónoma (A)</option>
                <option value="L">Entidad Local (L)</option>
                <option value="O">Otros órganos (O)</option>
              </select>
            </div>

            {tipoAdminInput === "A" && (
              <div className={styles.field}>
                <label htmlFor="regionId">Comunidad Autónoma</label>
                <select
                  id="regionId"
                  value={regionIdInput === "" ? "" : String(regionIdInput)}
                  onChange={(e) => {
                    const value = e.target.value;
                    const parsed = value ? Number(value) : "";
                    setRegionIdInput(parsed);
                    setRegionId(typeof parsed === "number" ? parsed : undefined);
                    setPage(1);
                  }}
                >
                  <option value="">Todas</option>
                  {regions.map((r) => (
                    <option key={r.id} value={String(r.id)}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className={styles.field}>
              <label htmlFor="order">Ordenar por</label>
              <select
                id="order"
                value={orderInput}
                onChange={(e) => {
                  const value = e.target.value;
                  setOrderInput(value);
                  setOrder(value);
                  setPage(1);
                }}
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
                onChange={(e) => {
                  const value = e.target.value as "asc" | "desc";
                  setDireccionInput(value);
                  setDireccion(value);
                  setPage(1);
                }}
              >
                <option value="desc">Descendente</option>
                <option value="asc">Ascendente</option>
              </select>
            </div>
          </div>

          <div className={styles.actions}>
            <button type="submit" disabled={loading || savingProfile}>
              {loading ? "Buscando..." : "Aplicar filtros"}
            </button>

            <button
              type="button"
              className={styles.secondaryButton}
              onClick={onClearFilters}
              disabled={loading || savingProfile}
            >
              Limpiar
            </button>

            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => void handleSaveGlobalProfile()}
              disabled={loading || savingProfile}
            >
              {savingProfile ? "Guardando..." : "Guardar perfil global"}
            </button>
          </div>
          {profileMessage ? <p className={styles.profileMessage}>{profileMessage}</p> : null}
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
                <button
                  type="button"
                  className={styles.detailButton}
                  onClick={() => void handleOpenDetail(grant.id)}
                >
                  Ver detalle interno
                </button>
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

        {detailOpen && (
          <div className={styles.modalOverlay} onClick={handleCloseDetail}>
            <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className={styles.modalClose}
                onClick={handleCloseDetail}
              >
                ×
              </button>

              {detailLoading ? <p>Cargando detalle...</p> : null}

              {detailError ? <p className={styles.error}>Error: {detailError}</p> : null}

              {!detailLoading && !detailError && detailData ? (
                <>
                  <h2 className={styles.modalTitle}>{detailData.title}</h2>

                  <p>
                    <strong>Organismo:</strong> {detailData.organization ?? "No informado"}
                  </p>
                  <p>
                    <strong>Fecha publicación:</strong>{" "}
                    {detailData.publicationDate ?? "No informada"}
                  </p>

                  <h3 className={styles.modalSectionTitle}>Descripción</h3>
                  <p className={styles.modalDescription}>
                    {detailData.description ?? "Sin descripción"}
                  </p>

                  {detailData.sourceUrl ? (
                    <a
                      className={styles.modalExternalLink}
                      href={detailData.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ver en portal oficial
                    </a>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        )}
        {profilesModalOpen && (
          <div className={styles.modalOverlay} onClick={() => setProfilesModalOpen(false)}>
            <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setProfilesModalOpen(false)}
              >
                ×
              </button>

              <h2 className={styles.modalTitle}>Gestión de alertas</h2>

              <h3 className={styles.modalSectionTitle}>Perfil de empresa (contexto para IA)</h3>

              <p className={styles.modalHint}>
                Describe tu empresa: sector, tamaño, ubicación, intereses y criterios de
                descarte. Este texto se usará como contexto para que la IA analice qué
                convocatorias son relevantes para vosotros.
              </p>

              {companyContextLoading ? (
                <p>Cargando perfil de empresa...</p>
              ) : (
                <>
                  <textarea
                    className={styles.companyProfileTextarea}
                    rows={5}
                    placeholder="Ej: Somos una PYME tecnológica de 12 empleados en Madrid, sector TIC. Nos interesan ayudas de I+D+i, digitalización y contratación. Descartamos ayudas agrarias y del sector pesquero."
                    value={companyContext}
                    onChange={(e) => {
                      setCompanyContext(e.target.value);
                      setCompanyContextMsg(null);
                    }}
                  />
                  <div className={`${styles.actions} ${styles.modalActions}`}>
                    <button
                      type="button"
                      className={styles.saveCompanyButton}
                      disabled={companyContextSaving || companyContext === companyContextSaved}
                      onClick={() => void saveCompanyProfile()}
                    >
                      {companyContextSaving ? "Guardando..." : "Guardar perfil de empresa"}
                    </button>
                  </div>
                  {companyContextMsg ? (
                    <p className={styles.modalHint}>{companyContextMsg}</p>
                  ) : null}
                </>
              )}

              <hr className={styles.sectionDivider} />

              <h3 className={styles.modalSectionTitle}>Destinatarios del resumen</h3>

              <div className={styles.recipientFormRow}>
                <select
                  value={newRecipientChannel}
                  onChange={(e) =>
                    setNewRecipientChannel(e.target.value === "telegram" ? "telegram" : "email")
                  }
                  aria-label="Canal"
                >
                  <option value="email">Email</option>
                  <option value="telegram">Telegram (chat ID)</option>
                </select>
                <input
                  placeholder={
                    newRecipientChannel === "email"
                      ? "correo@empresa.com"
                      : "ID numérico (ej. 123456789)"
                  }
                  value={newRecipientAddress}
                  onChange={(e) => setNewRecipientAddress(e.target.value)}
                />
                <input
                  placeholder="Etiqueta (opcional)"
                  value={newRecipientLabel}
                  onChange={(e) => setNewRecipientLabel(e.target.value)}
                />
                <button
                  type="button"
                  className={styles.addRecipientButton}
                  disabled={recipientSaving}
                  onClick={() => void createRecipient()}
                >
                  {recipientSaving ? "Añadiendo..." : "Añadir"}
                </button>
              </div>

              {recipientsLoading ? <p>Cargando destinatarios...</p> : null}
              {recipientsError ? <p className={styles.error}>Error: {recipientsError}</p> : null}

              {!recipientsLoading && recipients.length === 0 ? (
                <p className={styles.modalHint}>
                  No hay destinatarios en base de datos; se usará solo la configuración por
                  variables de entorno si existe.
                </p>
              ) : null}

              <ul className={styles.profileList}>
                {recipients.map((r) => (
                  <li key={r.id} className={styles.profileCard}>
                    <p>
                      <strong>{r.channel === "email" ? "Email" : "Telegram"}</strong>
                      {": "}
                      <code>{r.address}</code>
                      {r.label ? (
                        <>
                          {" "}
                          <span className={styles.recipientLabel}>({r.label})</span>
                        </>
                      ) : null}
                    </p>
                    <p className={styles.modalHint}>
                      Estado: {r.enabled ? "Activo" : "Pausado"}
                    </p>
                    <div className={styles.profileActions}>
                      <button
                        type="button"
                        className={r.enabled ? styles.warningButton : styles.successButton}
                        disabled={recipientBusyId === r.id}
                        onClick={() => void toggleRecipientEnabled(r)}
                      >
                        {r.enabled ? "Pausar" : "Activar"}
                      </button>
                      <button
                        type="button"
                        className={styles.dangerButton}
                        disabled={recipientBusyId === r.id}
                        onClick={() => void deleteRecipient(r.id)}
                      >
                        Eliminar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              <hr className={styles.sectionDivider} />

              <h3 className={styles.modalSectionTitle}>Perfiles de búsqueda (alertas)</h3>

              <div className={styles.profileFormGrid}>
                <input
                  placeholder="Nombre del perfil"
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                />
                <input
                  placeholder="Texto (ej. innovación)"
                  value={newProfileSearch}
                  onChange={(e) => setNewProfileSearch(e.target.value)}
                />
                <select
                  value={newProfileTipoAdmin}
                  onChange={(e) => {
                    const value = e.target.value;
                    setNewProfileTipoAdmin(value);
                    if (value !== "A") {
                      setNewProfileRegionId("");
                    }
                  }}
                >
                  <option value="">Administración: todas</option>
                  <option value="C">Estado</option>
                  <option value="A">Comunidad Autónoma</option>
                  <option value="L">Entidad Local</option>
                  <option value="O">Otros</option>
                </select>
                {newProfileTipoAdmin === "A" ? (
                  <select
                    value={newProfileRegionId}
                    onChange={(e) => setNewProfileRegionId(e.target.value)}
                  >
                    <option value="">Comunidad Autónoma: todas</option>
                    {regions.map((r) => (
                      <option key={r.id} value={String(r.id)}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input disabled placeholder="CCAA solo para administración autonómica" />
                )}
                <input
                  type="date"
                  value={newProfileFechaDesde}
                  onChange={(e) => setNewProfileFechaDesde(e.target.value)}
                />
                <input
                  type="date"
                  value={newProfileFechaHasta}
                  onChange={(e) => setNewProfileFechaHasta(e.target.value)}
                />
              </div>

              <div className={`${styles.actions} ${styles.modalActions}`}>
                <button
                  type="button"
                  className={styles.saveCompanyButton}
                  onClick={() => void createProfile()}
                  disabled={profilesSaving}
                >
                  {profilesSaving ? "Creando..." : "Crear perfil"}
                </button>
              </div>

              {profilesError ? <p className={styles.error}>Error: {profilesError}</p> : null}

              <hr className={styles.sectionDivider} />

              <h3 className={styles.modalSectionTitle}>Perfiles existentes</h3>
              {profilesLoading ? <p>Cargando...</p> : null}

              {!profilesLoading && profiles.length === 0 ? (
                <p>No hay perfiles creados todavía.</p>
              ) : null}

              <ul className={styles.profileList}>
                {profiles.map((p) => (
                  <li key={p.id} className={styles.profileCard}>
                    {editingProfileId === p.id ? (
                      <>
                        <div className={styles.profileFormGrid}>
                          <input
                            placeholder="Nombre del perfil"
                            value={p.name}
                            disabled={profileBusyId === p.id}
                            onChange={(e) => {
                              const value = e.target.value;
                              setProfiles((prev) =>
                                prev.map((item) =>
                                  item.id === p.id ? { ...item, name: value } : item
                                )
                              );
                            }}
                          />
                          <input
                            placeholder="Texto (ej. innovación)"
                            value={p.filters.searchText}
                            disabled={profileBusyId === p.id}
                            onChange={(e) => {
                              const value = e.target.value;
                              setProfiles((prev) =>
                                prev.map((item) =>
                                  item.id === p.id
                                    ? { ...item, filters: { ...item.filters, searchText: value } }
                                    : item
                                )
                              );
                            }}
                          />
                          <select
                            value={p.filters.tipoAdministracion ?? ""}
                            disabled={profileBusyId === p.id}
                            onChange={(e) => {
                              const value = e.target.value || null;
                              setProfiles((prev) =>
                                prev.map((item) =>
                                  item.id === p.id
                                    ? {
                                        ...item,
                                        filters: {
                                          ...item.filters,
                                          tipoAdministracion: value as AlertFilters["tipoAdministracion"],
                                          regionId: value !== "A" ? null : item.filters.regionId,
                                        },
                                      }
                                    : item
                                )
                              );
                            }}
                          >
                            <option value="">Administración: todas</option>
                            <option value="C">Estado</option>
                            <option value="A">Comunidad Autónoma</option>
                            <option value="L">Entidad Local</option>
                            <option value="O">Otros</option>
                          </select>
                          {p.filters.tipoAdministracion === "A" ? (
                            <select
                              value={p.filters.regionId ?? ""}
                              disabled={profileBusyId === p.id}
                              onChange={(e) => {
                                const value = e.target.value ? Number(e.target.value) : null;
                                setProfiles((prev) =>
                                  prev.map((item) =>
                                    item.id === p.id
                                      ? { ...item, filters: { ...item.filters, regionId: value } }
                                      : item
                                  )
                                );
                              }}
                            >
                              <option value="">Comunidad Autónoma: todas</option>
                              {regions.map((r) => (
                                <option key={r.id} value={String(r.id)}>
                                  {r.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input disabled placeholder="CCAA solo para administración autonómica" />
                          )}
                          <input
                            type="date"
                            value={p.filters.fechaDesde ?? ""}
                            disabled={profileBusyId === p.id}
                            onChange={(e) => {
                              const value = e.target.value || null;
                              setProfiles((prev) =>
                                prev.map((item) =>
                                  item.id === p.id
                                    ? { ...item, filters: { ...item.filters, fechaDesde: value } }
                                    : item
                                )
                              );
                            }}
                          />
                          <input
                            type="date"
                            value={p.filters.fechaHasta ?? ""}
                            disabled={profileBusyId === p.id}
                            onChange={(e) => {
                              const value = e.target.value || null;
                              setProfiles((prev) =>
                                prev.map((item) =>
                                  item.id === p.id
                                    ? { ...item, filters: { ...item.filters, fechaHasta: value } }
                                    : item
                                )
                              );
                            }}
                          />
                        </div>
                        <div className={styles.profileActions}>
                          <button
                            type="button"
                            className={styles.saveCompanyButton}
                            disabled={profileBusyId === p.id}
                            onClick={() => void saveProfileFull(p)}
                          >
                            Guardar cambios
                          </button>
                          <button
                            type="button"
                            className={styles.mutedButton}
                            disabled={profileBusyId === p.id}
                            onClick={() => {
                              setEditingProfileId(null);
                              void loadProfiles();
                            }}
                          >
                            Cancelar
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className={styles.profileCardTitle}>{p.name}</p>
                        <p>
                          {p.enabled ? "Activo" : "Inactivo"} · Texto:{" "}
                          {p.filters.searchText || "(vacío)"} · Admin:{" "}
                          {p.filters.tipoAdministracion ?? "todas"} · Región:{" "}
                          {typeof p.filters.regionId === "number"
                            ? (regionsById.get(p.filters.regionId) ?? p.filters.regionId)
                            : "todas"}
                        </p>
                        <div className={styles.profileActions}>
                          <button
                            type="button"
                            className={styles.primaryButton}
                            disabled={profileBusyId === p.id}
                            onClick={() => setEditingProfileId(p.id)}
                          >
                            Modificar
                          </button>
                          <button
                            type="button"
                            className={p.enabled ? styles.warningButton : styles.successButton}
                            disabled={profileBusyId === p.id}
                            onClick={() => void toggleProfileEnabled(p)}
                          >
                            {p.enabled ? "Desactivar" : "Activar"}
                          </button>
                          <button
                            type="button"
                            className={styles.dangerButton}
                            disabled={profileBusyId === p.id}
                            onClick={() => void deleteProfile(p.id)}
                          >
                            Eliminar
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}