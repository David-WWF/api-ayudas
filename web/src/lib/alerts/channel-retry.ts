/**
 * Reintentos de envío (email / Telegram) en el job de alertas.
 * El runner amplía el timeout exterior cuando ALERTS_CHANNEL_RETRIES > 0.
 */

export function getAlertsChannelRetries(): number {
  const raw = Number(process.env.ALERTS_CHANNEL_RETRIES ?? "2");
  if (!Number.isInteger(raw) || raw < 0 || raw > 10) return 2;
  return raw;
}

export function getAlertsChannelRetryDelayMs(): number {
  const raw = Number(process.env.ALERTS_CHANNEL_RETRY_DELAY_MS ?? "1000");
  if (!Number.isFinite(raw) || raw < 0 || raw > 60_000) return 1000;
  return Math.floor(raw);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Pausa entre intentos: base, 2×base, 4×base… */
export function backoffDelayMs(baseMs: number, attemptIndex: number): number {
  if (baseMs <= 0) return 0;
  return baseMs * 2 ** attemptIndex;
}

/**
 * Presupuesto total del `withTimeout` del runner: N intentos pueden usar hasta
 * `baseTimeoutMs` cada uno más las esperas entre fallos.
 */
export function computeAlertsChannelOuterTimeoutMs(baseTimeoutMs: number): number {
  const retries = getAlertsChannelRetries();
  const baseDelay = getAlertsChannelRetryDelayMs();
  let delaySum = 0;
  for (let i = 0; i < retries; i++) {
    delaySum += backoffDelayMs(baseDelay, i);
  }
  return baseTimeoutMs * (retries + 1) + delaySum;
}
