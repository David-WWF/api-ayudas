import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { searchGrants, type GrantItem } from "@/lib/bdns/client";
import { sendWeeklyDigestEmail } from "./mailer";
import { sendWeeklyDigestTelegram } from "./telegram";

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
};

type ProfileRunSummary = {
  profileId: number;
  profileName: string;
  totalFetched: number;
  newItemsCount: number;
};

export type WeeklyRunResult = {
  runId: string;
  processedProfiles: number;
  profilesWithNews: number;
  totalNewItems: number;
  emailStatus: "sent" | "error";
  emailMessage: string;
  telegramStatus: "sent" | "error";
  telegramMessage: string;
  dispatchStatus: "sent_both" | "sent_partial" | "error_both" | "no_news";
  profileSummaries: ProfileRunSummary[];
};

const DEFAULT_PAGE_SIZE = 40;
const ALLOWED_TIPO_ADMIN = ["C", "A", "L", "O"] as const;
const ALLOWED_ORDER = [
  "numeroConvocatoria",
  "mrr",
  "nivel1",
  "nivel2",
  "nivel3",
  "fechaRecepcion",
  "descripcion",
  "descripcionLeng",
] as const;

function normalizeFilters(input: unknown): AlertFilters {
  const body = (input ?? {}) as Record<string, unknown>;

  const tipoAdministracion =
    typeof body.tipoAdministracion === "string" &&
      (ALLOWED_TIPO_ADMIN as readonly string[]).includes(body.tipoAdministracion)
      ? (body.tipoAdministracion as AlertFilters["tipoAdministracion"])
      : null;

  const orderBy =
    typeof body.orderBy === "string" &&
      (ALLOWED_ORDER as readonly string[]).includes(body.orderBy)
      ? (body.orderBy as AlertFilters["orderBy"])
      : "fechaRecepcion";

  const direccion = body.direccion === "asc" ? "asc" : "desc";

  return {
    searchText: typeof body.searchText === "string" ? body.searchText : "",
    tipoAdministracion,
    regionId:
      typeof body.regionId === "number" && Number.isInteger(body.regionId) && body.regionId > 0
        ? body.regionId
        : null,
    fechaDesde:
      typeof body.fechaDesde === "string" && body.fechaDesde.length > 0 ? body.fechaDesde : null,
    fechaHasta:
      typeof body.fechaHasta === "string" && body.fechaHasta.length > 0 ? body.fechaHasta : null,
    orderBy,
    direccion,
  };
}

function mapProfileRow(row: Record<string, unknown>): AlertProfile {
  return {
    id: Number(row.id),
    name: String(row.name ?? ""),
    enabled: Boolean(row.enabled),
    filters: normalizeFilters(row.filters_json),
  };
}

async function ensureTables() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS alert_profiles (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT true,
      filters_json JSONB NOT NULL,
      schedule_cron TEXT NULL DEFAULT '0 9 * * 1',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS grants_snapshot (
      profile_id INTEGER NOT NULL,
      grant_id TEXT NOT NULL,
      title TEXT NOT NULL,
      publication_date TEXT NULL,
      source_url TEXT NULL,
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (profile_id, grant_id)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS alerts_history (
      id SERIAL PRIMARY KEY,
      run_id TEXT NOT NULL,
      profile_id INTEGER NOT NULL,
      profile_name TEXT NOT NULL,
      new_items_count INTEGER NOT NULL,
      status TEXT NOT NULL,
      error_message TEXT NULL,
      payload_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getActiveProfiles(): Promise<AlertProfile[]> {
  const result = await db.query(`
    SELECT id, name, enabled, filters_json
    FROM alert_profiles
    WHERE enabled = true
    ORDER BY created_at ASC
  `);

  return result.rows.map((row) => mapProfileRow(row));
}

function toUniqueGrantIds(items: GrantItem[]): string[] {
  const ids = items.map((i) => i.id).filter((id) => id && id.trim().length > 0);
  return [...new Set(ids)];
}

async function getKnownIds(profileId: number, grantIds: string[]): Promise<Set<string>> {
  if (grantIds.length === 0) return new Set();

  const result = await db.query(
    `
      SELECT grant_id
      FROM grants_snapshot
      WHERE profile_id = $1
        AND grant_id = ANY($2::text[])
    `,
    [profileId, grantIds]
  );

  return new Set(result.rows.map((row) => String(row.grant_id)));
}

async function upsertSnapshot(profileId: number, items: GrantItem[]) {
  for (const item of items) {
    await db.query(
      `
        INSERT INTO grants_snapshot (
          profile_id, grant_id, title, publication_date, source_url, first_seen_at, last_seen_at
        )
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        ON CONFLICT (profile_id, grant_id)
        DO UPDATE SET
          title = EXCLUDED.title,
          publication_date = EXCLUDED.publication_date,
          source_url = EXCLUDED.source_url,
          last_seen_at = NOW()
      `,
      [profileId, item.id, item.title, item.publicationDate, item.sourceUrl]
    );
  }
}

function toSearchParams(filters: AlertFilters) {
  return {
    q: filters.searchText || undefined,
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    fechaDesde: filters.fechaDesde ?? undefined,
    fechaHasta: filters.fechaHasta ?? undefined,
    tipoAdministracion: filters.tipoAdministracion ?? undefined,
    order: filters.orderBy,
    direccion: filters.direccion,
    regionId: filters.tipoAdministracion === "A" ? (filters.regionId ?? undefined) : undefined,
  };
}

export async function runWeeklyAlerts(): Promise<WeeklyRunResult> {
  await ensureTables();

  const runId = randomUUID();
  const profiles = await getActiveProfiles();

  const profileSummaries: ProfileRunSummary[] = [];
  const digestProfiles: Array<{
    profileId: number;
    profileName: string;
    newItems: GrantItem[];
  }> = [];

  for (const profile of profiles) {
    const result = await searchGrants(toSearchParams(profile.filters));
    const ids = toUniqueGrantIds(result.items);
    const knownIds = await getKnownIds(profile.id, ids);

    const newItems = result.items.filter((item) => !knownIds.has(item.id));
    await upsertSnapshot(profile.id, result.items);

    const status = newItems.length > 0 ? "pending_dispatch" : "no_news";

    await db.query(
      `
        INSERT INTO alerts_history (
          run_id, profile_id, profile_name, new_items_count, status, payload_json
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      `,
      [runId, profile.id, profile.name, newItems.length, status, JSON.stringify(newItems)]
    );

    profileSummaries.push({
      profileId: profile.id,
      profileName: profile.name,
      totalFetched: result.items.length,
      newItemsCount: newItems.length,
    });

    if (newItems.length > 0) {
      digestProfiles.push({
        profileId: profile.id,
        profileName: profile.name,
        newItems,
      });
    }
  }

  let emailStatus: "sent" | "error" = "error";
  let emailMessage = "No ejecutado.";
  let telegramStatus: "sent" | "error" = "error";
  let telegramMessage = "No ejecutado.";
  let dispatchStatus: "sent_both" | "sent_partial" | "error_both" | "no_news" = "no_news";

  if (digestProfiles.length === 0) {
    emailStatus = "sent";
    telegramStatus = "sent";
    emailMessage = "Sin novedades: no se requiere envio.";
    telegramMessage = "Sin novedades: no se requiere envio.";
    dispatchStatus = "no_news";
  } else {
    const payload = {
      runId,
      runAtIso: new Date().toISOString(),
      profiles: digestProfiles,
    };

    const [emailResult, telegramResult] = await Promise.all([
      sendWeeklyDigestEmail(payload),
      sendWeeklyDigestTelegram(payload),
    ]);

    emailStatus = emailResult.status === "sent" ? "sent" : "error";
    emailMessage = emailResult.message;
    telegramStatus = telegramResult.status === "sent" ? "sent" : "error";
    telegramMessage = telegramResult.message;

    if (emailStatus === "sent" && telegramStatus === "sent") {
      dispatchStatus = "sent_both";
    } else if (emailStatus === "error" && telegramStatus === "error") {
      dispatchStatus = "error_both";
    } else {
      dispatchStatus = "sent_partial";
    }

    const errorParts: string[] = [];
    if (emailStatus === "error") errorParts.push(`email: ${emailMessage}`);
    if (telegramStatus === "error") errorParts.push(`telegram: ${telegramMessage}`);
    const combinedError = errorParts.length > 0 ? errorParts.join(" | ") : null;

    await db.query(
      `
      UPDATE alerts_history
      SET
        status = $2,
        error_message = $3
      WHERE run_id = $1
        AND status = 'pending_dispatch'
    `,
      [runId, dispatchStatus, combinedError]
    );
  }

  const profilesWithNews = profileSummaries.filter((p) => p.newItemsCount > 0).length;
  const totalNewItems = profileSummaries.reduce((acc, p) => acc + p.newItemsCount, 0);

  return {
    runId,
    processedProfiles: profiles.length,
    profilesWithNews,
    totalNewItems,
    emailStatus,
    emailMessage,
    telegramStatus,
    telegramMessage,
    dispatchStatus,
    profileSummaries,
  };
}