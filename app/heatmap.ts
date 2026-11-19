export type HeatmapCellValue = string | number | boolean | Date | null | undefined;
export type HeatmapRow = Record<string, HeatmapCellValue>;
export type HeatmapScale = { min: number; max: number };

export function toHeatmapNumber(value: HeatmapCellValue) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(',', '.');
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildHeatmapScales(
  rows: HeatmapRow[],
  valueHeaders: string[],
  groupForRow?: (row: HeatmapRow) => string,
) {
  const ranges = new Map<string, HeatmapScale>();

  for (const row of rows) {
    for (const header of valueHeaders) {
      const value = toHeatmapNumber(row[header]);
      if (value === null) continue;
      const key = groupForRow ? groupForRow(row) : header;
      if (!key) continue;
      const current = ranges.get(key);
      ranges.set(key, current
        ? { min: Math.min(current.min, value), max: Math.max(current.max, value) }
        : { min: value, max: value });
    }
  }

  return ranges;
}

export function heatmapCellStyle(value: HeatmapCellValue, scale: HeatmapScale | undefined) {
  const numericValue = toHeatmapNumber(value);
  if (numericValue === null || !scale) return undefined;
  const position = scale.max === scale.min
    ? 0.5
    : Math.max(0, Math.min(1, (numericValue - scale.min) / (scale.max - scale.min)));
  const hue = Math.round(6 + position * 114);

  return {
    backgroundColor: `hsl(${hue} 72% 88%)`,
    color: '#17342c',
  };
}
