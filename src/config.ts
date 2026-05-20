import type { Env } from "./types";

export const ADMIN_REQUESTS_PER_MINUTE = 60;
export const DEFAULT_META_SENDS_PER_MINUTE = 30;

export function isAutomationEnabled(env: Pick<Env, "AUTOMATION_ENABLED">): boolean {
  return env.AUTOMATION_ENABLED === "true";
}

export function autoFinalAfterOpeningEnabled(env: Pick<Env, "AUTO_FINAL_AFTER_OPENING">): boolean {
  return env.AUTO_FINAL_AFTER_OPENING === "true";
}

export function metaSendsPerMinute(env: Pick<Env, "META_SENDS_PER_MINUTE">): number {
  const configured = Number.parseInt(env.META_SENDS_PER_MINUTE ?? "", 10);
  if (!Number.isFinite(configured)) return DEFAULT_META_SENDS_PER_MINUTE;
  return Math.min(Math.max(configured, 1), 120);
}
