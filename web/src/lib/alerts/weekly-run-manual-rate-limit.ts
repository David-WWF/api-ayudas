// Límite en memoria compartido entre POST manuales del job (UI y /api/alerts/weekly/run).

let lastRunRequestAt = 0;
const MIN_INTERVAL_MS = 10_000;

export function consumeWeeklyRunManualRateSlot(): {
  limited: boolean;
  retryAfterMs: number;
} {
  const now = Date.now();
  const elapsed = now - lastRunRequestAt;

  if (elapsed < MIN_INTERVAL_MS) {
    return {
      limited: true,
      retryAfterMs: MIN_INTERVAL_MS - elapsed,
    };
  }

  lastRunRequestAt = now;
  return { limited: false, retryAfterMs: 0 };
}
