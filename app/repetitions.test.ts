import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { aggregateRepetitions, parseMultiLocationMatrix, resolveRepetitionSelection, type MultiLocationRecord } from './multi-location';

const selection = { metric: 'VIG', location: 'L1', entity: 'E1', observer: 'O1' };
const record = (block: string, value: string | number, overrides: Partial<MultiLocationRecord> = {}): MultiLocationRecord => ({
  location: 'L1', entity: 'E1', observer: 'O1', genotype: 'G1', plot: 'P1', block, metrics: { VIG: value }, ...overrides,
});

describe('Rep by Rep', () => {
  it('preserva decimal com vírgula na leitura de CSV antes da consolidação', () => {
    const csv = 'Entity name;Location;(GER) Name;(OBS) Name;Plot name;Block;VIG\nE1;L1;G1;O1;P1;1;8,0\nE1;L1;G1;O1;P2;3;0';
    const workbook = XLSX.read(new TextEncoder().encode(csv), { type: 'array', cellDates: true, raw: true });
    const matrix = XLSX.utils.sheet_to_json<(string | number)[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '', raw: true });
    const parsed = parseMultiLocationMatrix(matrix);
    expect(aggregateRepetitions(parsed.records, selection).rows).toEqual([{ Genótipo: 'G1', Rep1: 8, Rep3: 0, Média: 4 }]);
  });

  it('calcula média por Block e dá peso igual a cada repetição, sem incluir Sem Block', () => {
    const result = aggregateRepetitions([record('1', 0), record('1', 4), record('2', '8,0'), record('3', 5), record('', 100)], selection);
    expect(result.headers).toEqual(['Genótipo', 'Rep1', 'Rep2', 'Rep3', 'Sem Block', 'Média']);
    expect(result.rows).toEqual([{ Genótipo: 'G1', Rep1: 2, Rep2: 8, Rep3: 5, 'Sem Block': 100, Média: 5 }]);
    expect(result.numericValueCount).toBe(5);
  });

  it('preserva lacunas, ordena naturalmente e não mistura recortes ou genótipos', () => {
    const result = aggregateRepetitions([
      record('10', 10), record('3', 3), record('1', 1), record('A', 8),
      record('1', 0, { genotype: 'G2' }), record('3', 'texto', { genotype: 'G2' }),
      record('1', 1000, { location: 'L2' }), record('1', 1000, { entity: 'E2' }), record('1', 1000, { observer: 'O2' }),
    ], selection);
    expect(result.headers).toEqual(['Genótipo', 'Rep1', 'Rep3', 'Rep10', 'Rep A', 'Média']);
    expect(result.rows[0]['Média']).toBe(5.5);
    expect(result.rows[1]).toEqual({ Genótipo: 'G2', Rep1: 0, Rep3: '', Rep10: '', 'Rep A': '', Média: 0 });
    expect(result.filteredRecordCount).toBe(6);
  });

  it('mantém Sem Block separado e média indisponível quando todos os Blocks são vazios', () => {
    const result = aggregateRepetitions([record('', 2), record('  ', 6), record('', 'texto', { genotype: 'G2' })], selection);
    expect(result.headers).toEqual(['Genótipo', 'Sem Block', 'Média']);
    expect(result.rows).toEqual([{ Genótipo: 'G1', 'Sem Block': 4, Média: '' }, { Genótipo: 'G2', 'Sem Block': '', Média: '' }]);
  });

  it('mantém vazio sem dados ou variável selecionada', () => {
    expect(aggregateRepetitions([], selection).rows).toEqual([]);
    expect(aggregateRepetitions([record('1', 2)], { ...selection, metric: '' }).rows).toEqual([]);
  });

  it('seleciona uma opção válida por etapa, preservando as escolhas válidas e substituindo inválidas', () => {
    const records = [record('1', 2), record('2', 3, { location: 'L2', entity: 'E2', observer: 'O2', metrics: { ALT: 4 } })];
    const first = resolveRepetitionSelection(records, ['EMPTY', 'VIG', 'ALT']);
    expect(first.selection).toEqual(selection);
    const next = resolveRepetitionSelection(records, ['VIG', 'ALT'], { ...first.selection, metric: 'ALT' });
    expect(next.selection).toEqual({ metric: 'ALT', location: 'L2', entity: 'E2', observer: 'O2' });
    expect(next.options.location).toEqual(['L2']);
    expect(resolveRepetitionSelection(records, ['VIG', 'ALT'], next.selection).selection).toEqual(next.selection);
    expect(resolveRepetitionSelection([], []).selection).toEqual({ metric: '', location: '', entity: '', observer: '' });
  });

  it('exporta os mesmos valores e a mesma ordem de colunas para Excel e CSV', () => {
    const result = aggregateRepetitions([record('1', 0), record('3', '4,5')], selection);
    const sheet = XLSX.utils.json_to_sheet(result.rows, { header: result.headers });
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Rep by Rep');
    const reread = XLSX.read(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
    expect(XLSX.utils.sheet_to_json(reread.Sheets['Rep by Rep'], { header: 1 })).toEqual([
      ['Genótipo', 'Rep1', 'Rep3', 'Média'], ['G1', 0, 4.5, 2.25],
    ]);
    expect(XLSX.utils.sheet_to_csv(sheet, { FS: ';' })).toContain('G1;0;4.5;2.25');
  });
});
