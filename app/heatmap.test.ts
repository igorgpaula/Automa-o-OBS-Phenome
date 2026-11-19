import { describe, expect, it } from 'vitest';
import { buildHeatmapScales, heatmapCellStyle, toHeatmapNumber } from './heatmap';

describe('heatmap', () => {
  it('calcula a escala somente com valores numéricos visíveis', () => {
    const rows = [{ VIG: 2 }, { VIG: '4,5' }, { VIG: '' }, { VIG: 'ausente' }];
    expect(buildHeatmapScales(rows, ['VIG']).get('VIG')).toEqual({ min: 2, max: 4.5 });
  });

  it('agrupa repetições pela variável da linha', () => {
    const rows = [
      { Variável: 'VIG', Rep1: 2, Rep2: 8 },
      { Variável: 'ALT', Rep1: 100, Rep2: 160 },
    ];
    const scales = buildHeatmapScales(rows, ['Rep1', 'Rep2'], (row) => String(row['Variável']));
    expect(scales.get('VIG')).toEqual({ min: 2, max: 8 });
    expect(scales.get('ALT')).toEqual({ min: 100, max: 160 });
  });

  it('mantém textos e vazios sem cor', () => {
    const scale = { min: 1, max: 9 };
    expect(heatmapCellStyle('', scale)).toBeUndefined();
    expect(heatmapCellStyle('texto', scale)).toBeUndefined();
    expect(heatmapCellStyle(5, scale)?.backgroundColor).toBe('hsl(63 72% 88%)');
    expect(toHeatmapNumber('3,25')).toBe(3.25);
  });
});
