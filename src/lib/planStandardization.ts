export type CorePlanCategory = 'IPTV' | 'P2P' | 'SSH';

export type StandardDurationDays = 30 | 90 | 180 | 365;

export const STANDARD_DURATIONS: Array<{ days: StandardDurationDays; label: string; multiplierFromMonthly: number }> = [
  { days: 30, label: 'Mensal', multiplierFromMonthly: 1 },
  { days: 90, label: 'Trimestral', multiplierFromMonthly: 3 },
  { days: 180, label: 'Semestral', multiplierFromMonthly: 6 },
  { days: 365, label: 'Anual', multiplierFromMonthly: 12 },
];

export const STANDARD_CATEGORY_ORDER: Record<string, number> = {
  IPTV: 0,
  P2P: 1,
  SSH: 2,
};

export function getDurationLabel(days: number): string {
  const found = STANDARD_DURATIONS.find((d) => d.days === days);
  return found?.label ?? `${days} dias`;
}

export function getDurationOrder(days: number): number {
  const idx = STANDARD_DURATIONS.findIndex((d) => d.days === days);
  return idx === -1 ? 999 : idx;
}

export function isCoreCategory(cat: string): cat is CorePlanCategory {
  return cat === 'IPTV' || cat === 'P2P' || cat === 'SSH';
}

export function getUnitLabel(category: CorePlanCategory, screens: number): string {
  if (category === 'SSH') return screens === 1 ? 'Login' : 'Logins';
  return screens === 1 ? 'Tela' : 'Telas';
}

export function buildStandardPlanName(category: CorePlanCategory, screens: number, durationDays: number): string {
  return `${category} ${screens} ${getUnitLabel(category, screens)} ${getDurationLabel(durationDays)}`;
}

export function buildStandardCorePlanMatrix(): Array<{ category: CorePlanCategory; screens: number; duration_days: StandardDurationDays }>
{
  const rows: Array<{ category: CorePlanCategory; screens: number; duration_days: StandardDurationDays }> = [];
  for (const duration of STANDARD_DURATIONS) {
    // IPTV and P2P: 1-3 screens
    for (const category of ['IPTV', 'P2P'] as const) {
      for (const screens of [1, 2, 3]) {
        rows.push({ category, screens, duration_days: duration.days });
      }
    }
    // SSH: 1-2 logins
    for (const screens of [1, 2]) {
      rows.push({ category: 'SSH', screens, duration_days: duration.days });
    }
  }
  return rows;
}

export function getPlanSortKey(plan: { category?: string | null; duration_days?: number | null; screens?: number | null; name?: string | null }) {
  const category = plan.category ?? '';
  const catOrder = STANDARD_CATEGORY_ORDER[category] ?? 999;
  const duration = plan.duration_days ?? 0;
  const durationOrder = getDurationOrder(duration);
  const screens = plan.screens ?? 1;
  const name = plan.name ?? '';
  return { catOrder, durationOrder, screens, name };
}

export function sortPlansForDisplay<T extends { category?: string | null; duration_days?: number | null; screens?: number | null; name?: string | null }>(
  plans: T[],
): T[] {
  return [...plans].sort((a, b) => {
    const ka = getPlanSortKey(a);
    const kb = getPlanSortKey(b);
    if (ka.catOrder !== kb.catOrder) return ka.catOrder - kb.catOrder;
    if (ka.durationOrder !== kb.durationOrder) return ka.durationOrder - kb.durationOrder;
    if (ka.screens !== kb.screens) return ka.screens - kb.screens;
    return ka.name.localeCompare(kb.name);
  });
}
