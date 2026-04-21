import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Rutas documentadas en web/README.md → segmentos bajo src/app/api.
 * Mantener sincronizado con la sección "Referencia de la API interna".
 */
const DOCUMENTED_ROUTE_SEGMENTS: string[][] = [
  ["grants", "search"],
  ["grants", "[id]"],
  ["catalogs", "regions"],
  ["settings", "global-filters"],
  ["settings", "alert-profiles"],
  ["settings", "alert-profiles", "[id]"],
  ["settings", "notification-recipients"],
  ["settings", "notification-recipients", "[id]"],
  ["settings", "company-profile"],
  ["ai", "analyze-test"],
  ["health"],
  ["alerts", "weekly", "run"],
  ["telegram", "webhook", "[secret]"],
  ["ops", "status-helper"],
  ["ops", "status-helper", "test-mail"],
  ["ops", "status-helper", "run-job"],
];

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_ROOT = join(__dirname, "../app/api");

function routeFilePath(segments: string[]): string {
  return join(API_ROOT, ...segments, "route.ts");
}

describe("Rutas API alineadas con la documentación", () => {
  for (const segments of DOCUMENTED_ROUTE_SEGMENTS) {
    const pathLabel = `/api/${segments.join("/")}`;
    it(`existe route.ts para ${pathLabel}`, () => {
      const filePath = routeFilePath(segments);
      expect(
        existsSync(filePath),
        `Falta el handler: ${filePath} (sincroniza con web/README.md o restaura el archivo)`
      ).toBe(true);
    });
  }
});
