import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { aggregateMultiLocation, aggregateRepetitions, inferMissingBlocks, listMultiLocationRecords, type MultiLocationRecord } from './multi-location';

const record = (plot: string, overrides: Partial<MultiLocationRecord> = {}): MultiLocationRecord => ({
  location: 'L1', entity: 'E1', genotype: 'G1', observer: 'O1', plot, block: '', metrics: { VIG: 4 }, ...overrides,
});
const selection = { location: 'L1', entity: 'E1', observer: 'O1', metric: 'VIG' };
const filters = { locations: ['L1'], entities: ['E1'], observers: ['O1', 'O2'] };

describe('inferMissingBlocks', () => {
  it('ordena parcelas numéricas e textuais e compartilha Block entre tomadores e variáveis', () => {
    const input = [record('P10'), record('P2'), record('P1'), record('P2', { observer: 'O2', metrics: { ALT: 8 } }),
      record('10', { genotype: 'G2' }), record('2', { genotype: 'G2' })];
    const original = structuredClone(input);
    const result = inferMissingBlocks(input);
    expect(result.records.map((r) => r.block)).toEqual(['3', '2', '1', '2', '2', '1']);
    expect(result.summary).toEqual({ inferredPlots: 5, inferredRecords: 6, pendingGroups: [] });
    expect(input).toEqual(original);
    expect(inferMissingBlocks(result.records).records).toEqual(result.records);
    expect(inferMissingBlocks([...input].reverse()).records.reverse()).toEqual(result.records);
  });

  it('separa local, ensaio e genótipo e atribui 1 para uma única parcela', () => {
    const result = inferMissingBlocks([record('10'), record('2', { location: 'L2' }), record('2', { entity: 'E2' }), record('2', { genotype: 'G2' })]);
    expect(result.records.map((r) => r.block)).toEqual(['1', '1', '1', '1']);
    expect(result.summary.inferredPlots).toBe(4);
  });

  it('preserva Blocks existentes equivalentes e não divide Rep01 e Rep1 na consolidação', () => {
    const result = inferMissingBlocks([record('1', { block: '01', metrics: { VIG: 2 } }), record('1', { block: '1', metrics: { VIG: 4 } }), record('1', { metrics: { VIG: 6 } }), record('2', { metrics: { VIG: 8 } })]);
    expect(result.records.map((r) => r.block)).toEqual(['01', '1', '1', '2']);
    expect(result.summary.inferredPlots).toBe(2);
    expect(aggregateRepetitions(result.records, selection).rows).toEqual([{ Genótipo: 'G1', Rep1: 4, Rep2: 8, Média: 6 }]);
    expect(listMultiLocationRecords(result.records, filters, ['VIG']).rows.map((r) => r.Block)).toContain('01');
  });

  it.each(['2', 'A', '0', '1,5'])('mantém vazios do grupo quando Block existente %s contraria a sequência', (block) => {
    const input = [record('1', { block }), record('2')];
    const result = inferMissingBlocks(input);
    expect(result.records).toEqual(input);
    expect(result.summary.pendingGroups).toEqual([{ location: 'L1', entity: 'E1', genotype: 'G1', pendingRecords: 1, reasons: ['conflict'] }]);
    const aggregated = aggregateRepetitions(result.records, selection);
    expect(aggregated.rows[0]['Sem Block']).toBe(4);
    expect(aggregated.rows[0]['Média']).toBe(4);
  });

  it('detecta Blocks divergentes da mesma parcela e não impede preenchimento de outros grupos', () => {
    const result = inferMissingBlocks([record('1', { block: '1' }), record('1', { block: '2' }), record('3'), record('9', { genotype: 'G2' })]);
    expect(result.records.map((r) => r.block)).toEqual(['1', '2', '', '1']);
    expect(result.summary.inferredPlots).toBe(1);
    expect(result.summary.pendingGroups).toHaveLength(1);
  });

  it('não preenche registros com identificadores ausentes e informa as pendências', () => {
    const input = [record('1', { location: '' }), record('1', { entity: '' }), record('1', { genotype: '' }), record(''), record('2')];
    const result = inferMissingBlocks(input);
    expect(result.records.map((r) => r.block)).toEqual(['', '', '', '', '1']);
    expect(result.summary.pendingGroups).toHaveLength(4);
    expect(result.summary.pendingGroups.every((g) => g.reasons.includes('missing-identifiers'))).toBe(true);
    expect(aggregateRepetitions(result.records, selection).rows[0]).toMatchObject({ Rep1: 4, 'Sem Block': 4, Média: 4 });
  });

  it('usa todas as parcelas antes dos filtros e mantém o cálculo da aba Médias', () => {
    const input = [record('3', { metrics: { VIG: 8 } }), record('1', { observer: 'O2', metrics: { ALT: 4 } }), record('2', { metrics: { VIG: 0 } })];
    const { records } = inferMissingBlocks(input);
    expect(aggregateRepetitions(records, selection).rows).toEqual([{ Genótipo: 'G1', Rep2: 0, Rep3: 8, Média: 4 }]);
    expect(aggregateMultiLocation(records, filters, ['VIG', 'ALT'])).toEqual(aggregateMultiLocation(input, filters, ['VIG', 'ALT']));
    const rows = listMultiLocationRecords(records, filters, ['VIG']).rows;
    const sheet = XLSX.utils.json_to_sheet(rows);
    expect(XLSX.utils.sheet_to_json(sheet)).toEqual(rows);
    expect(XLSX.utils.sheet_to_csv(sheet, { FS: ';' })).toContain('L1;E1;G1;O1;2;2;0');
  });

  it('mantém arquivos já preenchidos e entradas vazias', () => {
    const input = [record('1', { block: 'A' })];
    expect(inferMissingBlocks(input)).toEqual({ records: input, summary: { inferredPlots: 0, inferredRecords: 0, pendingGroups: [] } });
    expect(inferMissingBlocks([])).toEqual({ records: [], summary: { inferredPlots: 0, inferredRecords: 0, pendingGroups: [] } });
  });
});
