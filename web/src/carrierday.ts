import type { RulesConfig } from '../../engine/src/index.ts';

/**
 * Clamp `dayStartMinute` to an integer in 0..59 (anything else → 0).
 * Required in the app layer because `web/src/store.ts` is frozen and its `sanitizeConfig`
 * spreads stored config over defaults without clamping `dayStartMinute`.
 */
export function clampDayStartMinute(v: unknown): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 59 ? v : 0;
}

/**
 * Return a RulesConfig whose `dayStartMinute` is guaranteed to be an integer in 0..59.
 * Leaves already-valid configs untouched by reference.
 */
export function safeRulesConfig(cfg: RulesConfig): RulesConfig {
  const m = clampDayStartMinute((cfg as { dayStartMinute?: unknown }).dayStartMinute);
  return cfg.dayStartMinute === m ? cfg : { ...cfg, dayStartMinute: m };
}

/** Exact carrier-day boundary as "HH:MM" (e.g. "00:00", "06:00", "18:40"). */
export function formatDayStartHM(cfg: Pick<RulesConfig, 'dayStartHour'> & { dayStartMinute?: unknown }): string {
  const h = typeof cfg.dayStartHour === 'number' && Number.isInteger(cfg.dayStartHour) && cfg.dayStartHour >= 0 && cfg.dayStartHour <= 23
    ? cfg.dayStartHour
    : 0;
  const m = clampDayStartMinute(cfg.dayStartMinute);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Natural phrasing for the carrier-day boundary: "midnight" for 00:00, else exact "HH:MM"
 * (e.g. "06:00", "00:30", "18:40"). Non-zero minutes are always shown.
 */
export function dayStartWord(cfg: Pick<RulesConfig, 'dayStartHour'> & { dayStartMinute?: unknown }): string {
  const h = typeof cfg.dayStartHour === 'number' && Number.isInteger(cfg.dayStartHour) && cfg.dayStartHour >= 0 && cfg.dayStartHour <= 23
    ? cfg.dayStartHour
    : 0;
  const m = clampDayStartMinute(cfg.dayStartMinute);
  return h === 0 && m === 0 ? 'midnight' : `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
