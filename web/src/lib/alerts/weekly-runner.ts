import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { normalizeAlertFilters, type AlertFilters } from "@/lib/domain/alert-filters";
import type { GrantItem } from "@/lib/domain/grants";
import { searchGrants } from "@/lib/bdns/client";
import { analyzeGrants, isAiConfigured, type GrantAiResult } from "@/lib/ai/grant-analyzer";
import { enrichGrantsWithEligibility } from "@/lib/bdns/detail";
import { sendWeeklyDigestEmail } from "./mailer";
import {
  sendAlertStatusTelegram,
  type AlertStatusProfileLine,
  type AlertStatusTelegramInput,
} from "./telegram";
import { ensureNotificationRecipientsTable } from "./notification-recipients";
import { ensureAlertJobOpsStateTable, saveAlertJobOpsState } from "./alert-job-ops-state";
import { computeAlertsChannelOuterTimeoutMs } from "./channel-retry";
import {
  getAlertsTimeZone,
  profileCronMatchesNow,
  shouldRespectProfileCron,
} from "./cron-match";

// Modelo interno de perfil activo en memoria.
type AlertProfile = {
  id: number;
  name: string;
  enabled: boolean;
  filters: AlertFilters;
  scheduleCron: string | null;
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
  /** Perfiles habilitados omitidos porque su `schedule_cron` no coincide con este minuto (solo si `ALERTS_RESPECT_PROFILE_CRON`). */
  profilesSkippedCron: number;
  profilesWithNews: number;
  totalNewItems: number;
  aiAnalysis: { ran: boolean; model?: string; tokensUsed?: number; error?: string };
  emailStatus: "sent" | "error";
  emailMessage: string;
  telegramStatus: "sent" | "error";
  telegramMessage: string;
  dispatchStatus: "sent_both" | "sent_partial" | "error_both" | "no_news";
  profileSummaries: ProfileRunSummary[];
};

// Candado en memoria para evitar ejecuciones simultaneas en el mismo proceso.
let weeklyRunInProgress = false;

export class WeeklyRunAlreadyRunningError extends Error {
  constructor() {
    super("Ya hay una ejecución de alertas en curso.");
    this.name = "WeeklyRunAlreadyRunningError";
  }
}

export function isWeeklyRunInProgress(): boolean {
  return weeklyRunInProgress;
}

const DEFAULT_PAGE_SIZE = 40;

function mapProfileRow(row: Record<string, unknown>): AlertProfile {
  // Mapea fila SQL a modelo de dominio.
  return {
    id: Number(row.id),
    name: String(row.name ?? ""),
    enabled: Boolean(row.enabled),
    filters: normalizeAlertFilters(row.filters_json),
    scheduleCron: typeof row.schedule_cron === "string" ? row.schedule_cron : null,
  };
}

function buildAlertStatusProfileLines(
  digestProfiles: Array<{ profileName: string; newItems: GrantItem[] }>,
  profileSummaries: ProfileRunSummary[],
  aiMap: Map<string, GrantAiResult>
): AlertStatusProfileLine[] {
  if (digestProfiles.length > 0) {
    return digestProfiles.map((dp) => {
      let alta = 0;
      let media = 0;
      let baja = 0;
      let sinClasificar = 0;
      for (const item of dp.newItems) {
        const r = aiMap.get(item.id)?.relevance?.toLowerCase().trim();
        if (r === "alta") alta += 1;
        else if (r === "media") media += 1;
        else if (r === "baja") baja += 1;
        else sinClasificar += 1;
      }
      return {
        profileName: dp.profileName,
        newItemsCount: dp.newItems.length,
        alta,
        media,
        baja,
        sinClasificar,
      };
    });
  }
  return profileSummaries.map((p) => ({
    profileName: p.profileName,
    newItemsCount: p.newItemsCount,
    alta: 0,
    media: 0,
    baja: 0,
    sinClasificar: 0,
  }));
}

function buildOpsLogText(input: {
  runId: string;
  runAtIso: string;
  dispatchStatus: string;
  emailStatus: string;
  emailMessage: string;
  telegramStatus: string;
  telegramMessage: string;
  profileSummaries: ProfileRunSummary[];
  aiAnalysis: WeeklyRunResult["aiAnalysis"];
  skippedCron: number;
  activeProfilesCount: number;
}): string {
  const parts: string[] = [];
  parts.push(`[${input.runAtIso}] runId=${input.runId}`);
  parts.push(`dispatch=${input.dispatchStatus} email=${input.emailStatus} telegram=${input.telegramStatus}`);
  parts.push(`emailMsg: ${input.emailMessage}`);
  parts.push(`telegramMsg: ${input.telegramMessage}`);
  parts.push(`perfiles_activos_bd=${input.activeProfilesCount} omitidos_cron=${input.skippedCron}`);
  for (const p of input.profileSummaries) {
    parts.push(`  - ${p.profileName}: nuevas=${p.newItemsCount} fetch=${p.totalFetched}`);
  }
  parts.push(
    `IA: ran=${input.aiAnalysis.ran} model=${input.aiAnalysis.model ?? ""} err=${input.aiAnalysis.error ?? ""}`
  );
  return parts.join("\n");
}

async function ensureTables() {
  await ensureNotificationRecipientsTable();
  await ensureAlertJobOpsStateTable();

  // Tabla de perfiles de alertas configurables.
  // schedule_cron: si ALERTS_RESPECT_PROFILE_CRON=true, el runner solo procesa el perfil cuando
  // este minuto coincide con la expresión (convive con ALERTS_AUTORUN_CRON del scheduler, p. ej. cada minuto).
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

  // Snapshot por perfil para deduplicar convocatorias ya vistas.
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

  // Historial auditable de cada corrida/perfil.
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

  // Perfil de empresa (fila única): contexto de negocio para el análisis IA de convocatorias.
  await db.query(`
    CREATE TABLE IF NOT EXISTS company_profile (
      id INTEGER PRIMARY KEY DEFAULT 1,
      context_text TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT company_profile_singleton CHECK (id = 1)
    )
  `);
  await db.query(`
    INSERT INTO company_profile (id) VALUES (1)
    ON CONFLICT (id) DO NOTHING
  `);
}

async function getActiveProfiles(): Promise<AlertProfile[]> {
  // Solo perfiles habilitados; orden estable por fecha de creacion.
  const result = await db.query(`
    SELECT id, name, enabled, filters_json, schedule_cron
    FROM alert_profiles
    WHERE enabled = true
    ORDER BY created_at ASC
  `);

  return result.rows.map((row) => mapProfileRow(row));
}

function toUniqueGrantIds(items: GrantItem[]): string[] {
  // Elimina ids vacios y repetidos antes de consultar snapshot.
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
  // Upsert item a item para conservar first_seen_at y actualizar last_seen_at.
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
  // Traduce filtros internos al contrato del cliente BDNS.
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

function getTimeoutMs(): number {
  // Timeout configurable por entorno con fallback seguro.
  const raw = Number(process.env.ALERTS_CHANNEL_TIMEOUT_MS ?? "15000");
  return Number.isFinite(raw) && raw > 0 ? raw : 15000;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  // Protege cada canal para que uno lento no bloquee toda la corrida.
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`Timeout en canal ${label} (${ms}ms)`)), ms);

    promise
      .then((value) => {
        clearTimeout(id);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(id);
        reject(err);
      });
  });
}

export async function runWeeklyAlerts(): Promise<WeeklyRunResult> {
  if (weeklyRunInProgress) {
    throw new WeeklyRunAlreadyRunningError();
  }

  weeklyRunInProgress = true;
  const startedAt = Date.now();
  try {
    await ensureTables();

    const runId = randomUUID();

    // 1) Carga perfiles activos.
    const profiles = await getActiveProfiles();
    const respectCron = shouldRespectProfileCron();
    const tz = getAlertsTimeZone();
    const now = new Date();

    console.info(
      JSON.stringify({
        event: "weekly_run_started",
        runId,
        profilesCount: profiles.length,
        respectProfileCron: respectCron,
        timeZone: tz,
      })
    );

    const profileSummaries: ProfileRunSummary[] = [];
    const digestProfiles: Array<{
      profileId: number;
      profileName: string;
      newItems: GrantItem[];
    }> = [];
    let skippedCron = 0;

    for (const profile of profiles) {
      if (respectCron && !profileCronMatchesNow(profile.scheduleCron, now, tz)) {
        skippedCron += 1;
        console.info(
          JSON.stringify({
            event: "weekly_run_profile_skipped_cron",
            runId,
            profileId: profile.id,
            scheduleCron: profile.scheduleCron,
          })
        );
        continue;
      }

      // 2) Ejecuta busqueda BDNS por perfil.
      const result = await searchGrants(toSearchParams(profile.filters));
      const ids = toUniqueGrantIds(result.items);
      const knownIds = await getKnownIds(profile.id, ids);

      // 3) Detecta solo novedades comparando contra snapshot.
      const newItems = result.items.filter((item) => !knownIds.has(item.id));
      // 4) Actualiza snapshot completo para la siguiente corrida.
      await upsertSnapshot(profile.id, result.items);

      const status = newItems.length > 0 ? "pending_dispatch" : "no_news";

      // 5) Inserta trazabilidad por perfil antes del envio.
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
    // ── Enriquecimiento de elegibilidad vía API BDNS (opcional) ──────
    const shouldEnrich = (process.env.AI_ENRICH_DETAIL ?? "true").toLowerCase() !== "false";

    if (digestProfiles.length > 0 && shouldEnrich) {
      try {
        const allNewItems = digestProfiles.flatMap((p) => p.newItems);
        const uniqueById = new Map<string, GrantItem>();
        for (const item of allNewItems) uniqueById.set(item.id, item);
        const uniqueItems = [...uniqueById.values()];

        console.info(JSON.stringify({
          event: "weekly_run_enrich_start",
          runId,
          items: uniqueItems.length,
        }));

        await enrichGrantsWithEligibility(uniqueItems);

        const enrichedCount = uniqueItems.filter((i) => i.beneficiaryTypes && i.beneficiaryTypes.length > 0).length;
        console.info(JSON.stringify({
          event: "weekly_run_enrich_done",
          runId,
          enriched: enrichedCount,
          total: uniqueItems.length,
        }));
      } catch (enrichError) {
        const msg = enrichError instanceof Error ? enrichError.message : "Error enriquecimiento";
        console.error(JSON.stringify({ event: "weekly_run_enrich_error", runId, error: msg }));
      }
    }

    // ── Análisis IA (opcional, antes del envío) ──────────────────────
    let aiInfo: WeeklyRunResult["aiAnalysis"] = { ran: false };
    const aiMap = new Map<string, GrantAiResult>();

    if (digestProfiles.length > 0 && isAiConfigured()) {
      try {
        const cpRow = await db.query(`SELECT context_text FROM company_profile WHERE id = 1`);
        const companyContext = String(cpRow.rows[0]?.context_text ?? "");

        if (companyContext.trim()) {
          const allNewItems = digestProfiles.flatMap((p) => p.newItems);
          const aiResult = await analyzeGrants(companyContext, allNewItems);

          if (aiResult) {
            aiInfo = { ran: true, model: aiResult.model, tokensUsed: aiResult.tokensUsed };
            for (const r of aiResult.results) {
              aiMap.set(r.grantId, r);
            }
            console.info(JSON.stringify({
              event: "weekly_run_ai_completed",
              runId,
              model: aiResult.model,
              tokensUsed: aiResult.tokensUsed,
              analyzed: aiResult.results.length,
            }));
          }
        }
      } catch (aiError) {
        const msg = aiError instanceof Error ? aiError.message : "Error IA desconocido";
        aiInfo = { ran: false, error: msg };
        console.error(JSON.stringify({ event: "weekly_run_ai_error", runId, error: msg }));
      }
    }
    // ── Fin análisis IA ────────────────────────────────────────────

    let emailStatus: "sent" | "error" = "error";
    let emailMessage = "No ejecutado.";
    let telegramStatus: "sent" | "error" = "error";
    let telegramMessage = "No ejecutado.";
    let dispatchStatus: "sent_both" | "sent_partial" | "error_both" | "no_news" = "no_news";

    const runAtIso = new Date().toISOString();
    const profileLines = buildAlertStatusProfileLines(digestProfiles, profileSummaries, aiMap);
    const totalNewItems = digestProfiles.reduce((acc, p) => acc + p.newItems.length, 0);
    const noActiveProfiles = profiles.length === 0;
    const allProfilesSkippedCron =
      profiles.length > 0 && respectCron && profileSummaries.length === 0 && skippedCron > 0;

    const timeoutMs = computeAlertsChannelOuterTimeoutMs(getTimeoutMs());

    const baseStatusInput = (): AlertStatusTelegramInput => ({
      runId,
      runAtIso,
      dispatchStatus: "no_news",
      emailStatus,
      emailMessage,
      totalNewItems,
      profileLines,
      profilesSkippedCron: skippedCron,
      evaluatedProfiles: profileSummaries.length,
      configuredProfileCount: profiles.length,
      allProfilesSkippedCron,
      noActiveProfiles,
      aiRan: aiInfo.ran,
      aiModel: aiInfo.model,
      aiError: aiInfo.error,
    });

    if (digestProfiles.length === 0) {
      // Sin digest por correo: igualmente informe de estado por Telegram.
      emailStatus = "sent";
      emailMessage = "Sin novedades: no se requiere envío de correo.";
      const telegramResult = await withTimeout(
        sendAlertStatusTelegram({
          ...baseStatusInput(),
          dispatchStatus: "no_news",
        }),
        timeoutMs,
        "telegram_status"
      );
      telegramStatus = telegramResult.status === "sent" ? "sent" : "error";
      telegramMessage = telegramResult.message;
      dispatchStatus = telegramStatus === "error" ? "sent_partial" : "no_news";
    } else {
      const payload = {
        runId,
        runAtIso,
        profiles: digestProfiles,
        aiMap,
      };

      // 6) Correo con digest; informe corto a Telegram después (incluye resultado del email).
      const emailResult = await withTimeout(sendWeeklyDigestEmail(payload), timeoutMs, "email");
      emailStatus = emailResult.status === "sent" ? "sent" : "error";
      emailMessage = emailResult.message;

      const telegramResult = await withTimeout(
        sendAlertStatusTelegram({
          ...baseStatusInput(),
          dispatchStatus: emailStatus === "sent" ? "sent_both" : "sent_partial",
        }),
        timeoutMs,
        "telegram_status"
      );
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

      // 7) Cierra estados pendientes con resultado consolidado.
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

      // 8) Si hubo análisis IA, enriquece payload_json con scoring.
      if (aiMap.size > 0) {
        for (const dp of digestProfiles) {
          const enriched = dp.newItems.map((item) => {
            const ai = aiMap.get(item.id);
            return ai
              ? { ...item, aiRelevance: ai.relevance, aiReason: ai.reason }
              : item;
          });
          await db.query(
            `UPDATE alerts_history SET payload_json = $1::jsonb WHERE run_id = $2 AND profile_id = $3`,
            [JSON.stringify(enriched), runId, dp.profileId],
          );
        }
      }
    }

    const processedCount = profileSummaries.length;
    const profilesWithNews = profileSummaries.filter((p) => p.newItemsCount > 0).length;
    const totalNewItemsAgg = profileSummaries.reduce((acc, p) => acc + p.newItemsCount, 0);

    try {
      await saveAlertJobOpsState({
        lastRunId: runId,
        lastFinishedAt: new Date(),
        lastDispatchStatus: dispatchStatus,
        lastEmailStatus: emailStatus,
        lastEmailMessage: emailMessage,
        lastTelegramStatus: telegramStatus,
        lastTelegramMessage: telegramMessage,
        lastSummaryJson: {
          runId,
          runAtIso,
          dispatchStatus,
          totalNewItems: totalNewItemsAgg,
          profilesSkippedCron: skippedCron,
          processedProfiles: processedCount,
          profilesWithNews,
          aiAnalysis: aiInfo,
          profileSummaries,
        },
        lastLogText: buildOpsLogText({
          runId,
          runAtIso,
          dispatchStatus,
          emailStatus,
          emailMessage,
          telegramStatus,
          telegramMessage,
          profileSummaries,
          aiAnalysis: aiInfo,
          skippedCron,
          activeProfilesCount: profiles.length,
        }),
      });
    } catch (persistErr) {
      console.error(
        JSON.stringify({
          event: "weekly_run_ops_state_persist_error",
          runId,
          error: persistErr instanceof Error ? persistErr.message : "unknown",
        })
      );
    }

    console.info(
      JSON.stringify({
        event: "weekly_run_finished",
        runId,
        durationMs: Date.now() - startedAt,
        processedProfiles: processedCount,
        profilesSkippedCron: skippedCron,
        profilesWithNews,
        totalNewItems: totalNewItemsAgg,
        dispatchStatus,
        emailStatus,
        telegramStatus,
      })
    );

    return {
      runId,
      processedProfiles: processedCount,
      profilesSkippedCron: skippedCron,
      profilesWithNews,
      totalNewItems: totalNewItemsAgg,
      aiAnalysis: aiInfo,
      emailStatus,
      emailMessage,
      telegramStatus,
      telegramMessage,
      dispatchStatus,
      profileSummaries,
    };
  }
  catch (error) {
    // Log estructurado para observabilidad y troubleshooting.
    console.error(
      JSON.stringify({
        event: "weekly_run_error",
        error: error instanceof Error ? error.message : "Error desconocido",
        durationMs: Date.now() - startedAt,
      })
    );
    throw error;
  }
  finally {
    // Libera candado aunque haya error para no dejar el job bloqueado.
    weeklyRunInProgress = false;
  }
}

