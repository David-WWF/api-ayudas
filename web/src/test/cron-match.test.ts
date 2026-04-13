import { afterEach, describe, expect, it } from "vitest";
import { profileCronMatchesNow, shouldRespectProfileCron } from "@/lib/alerts/cron-match";

describe("profileCronMatchesNow", () => {
  it("lunes 9:00 (UTC) coincide con 0 9 * * 1", () => {
    const d = new Date(Date.UTC(2024, 0, 8, 9, 0, 30));
    expect(profileCronMatchesNow("0 9 * * 1", d, "UTC")).toBe(true);
  });

  it("martes 9:00 (UTC) no coincide con 0 9 * * 1", () => {
    const d = new Date(Date.UTC(2024, 0, 9, 9, 0, 30));
    expect(profileCronMatchesNow("0 9 * * 1", d, "UTC")).toBe(false);
  });

  it("cada minuto: * * * * * en cualquier instante del minuto", () => {
    const d = new Date(Date.UTC(2024, 0, 9, 14, 37, 12));
    expect(profileCronMatchesNow("* * * * *", d, "UTC")).toBe(true);
  });
});

describe("shouldRespectProfileCron", () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it("por defecto (sin env) es false", () => {
    delete process.env.ALERTS_RESPECT_PROFILE_CRON;
    expect(shouldRespectProfileCron()).toBe(false);
  });

  it("true con valor 1", () => {
    process.env.ALERTS_RESPECT_PROFILE_CRON = "1";
    expect(shouldRespectProfileCron()).toBe(true);
  });
});
