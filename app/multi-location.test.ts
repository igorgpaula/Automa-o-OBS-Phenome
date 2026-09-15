import { describe, expect, it } from 'vitest';
import { aggregateMultiLocation, parseMultiLocationMatrix } from './multi-location';

const matrix = [
  ['ID', 'FEID', 'Entity name', 'Location', '(GER) Name', 'FEID', '(OBS) Name', 'Plot name', 'Block', 'VIG', 'ALT'],
  [1, 101, 'Ensaio 1', 'Local A', ' GEN 1 ', 201, 'AA', '1001', '', '5', 10],
  [2, 102, 'Ensaio 2', 'Local B', 'GEN 1', 202, 'BB', '1002', '', 7, ''],
  [3, 103, 'Ensaio 2', 'Local B', 'GEN 2', 203, 'AA', '1003', 2, 'texto', 20],
  [4, 104, 'Ensaio 1', 'Local A', 'GEN 1', 204, 'BB', '1004', '', '6,0', 14],
];

describe('parseMultiLocationMatrix', () => {
  it('ignora colunas anteriores a Block, aceita FEID duplicado e Block vazio', () => {
    const parsed = parseMultiLocationMatrix(matrix);

    expect(parsed.metricNames).toEqual(['VIG', 'ALT']);
    expect(parsed.records).toHaveLength(4);
    expect(parsed.records[0]).toMatchObject({
      entity: 'Ensaio 1',
      location: 'Local A',
      genotype: 'GEN 1',
      observer: 'AA',
      plot: '1001',
      block: '',
    });
  });

  it('reconhece aliases sem diferenciar acentos, caixa ou espaços extras', () => {
    const parsed = parseMultiLocationMatrix([
      ['Nome do Ensaio', 'LOCALIDADE', ' Genótipo ', 'Avaliador', 'Parcela', 'Repetição', 'VIG'],
      ['E1', 'L1', 'G1', 'AB', 'P1', '', '4,5'],
    ]);

    expect(parsed.records[0]).toMatchObject({ entity: 'E1', location: 'L1', genotype: 'G1', observer: 'AB' });
    expect(parsed.metricNames).toEqual(['VIG']);
  });

  it('bloqueia variáveis duplicadas depois de Block', () => {
    expect(() => parseMultiLocationMatrix([
      ['Entity name', 'Location', '(GER) Name', '(OBS) Name', 'Plot name', 'Block', 'VIG', 'vig'],
      ['E1', 'L1', 'G1', 'AA', 'P1', '', 5, 6],
    ])).toThrow(/variáveis duplicadas/i);
  });
});

describe('aggregateMultiLocation', () => {
  const parsed = parseMultiLocationMatrix(matrix);
  const allFilters = {
    entities: ['Ensaio 1', 'Ensaio 2'],
    locations: ['Local A', 'Local B'],
    observers: ['AA', 'BB'],
  };

  it('calcula médias por genótipo entre ensaios, locais e observadores', () => {
    const result = aggregateMultiLocation(parsed.records, allFilters, ['VIG', 'ALT']);

    expect(result.rows).toEqual([
      { '(GER) Name': 'GEN 1', 'VIG (média)': 6, 'ALT (média)': 12 },
      { '(GER) Name': 'GEN 2', 'VIG (média)': '', 'ALT (média)': 20 },
    ]);
    expect(result.filteredRecordCount).toBe(4);
    expect(result.numericValueCount).toBe(6);
  });

  it('aplica as três segmentações por interseção', () => {
    const result = aggregateMultiLocation(parsed.records, {
      entities: ['Ensaio 1'],
      locations: ['Local A'],
      observers: ['BB'],
    }, ['VIG', 'ALT']);

    expect(result.rows).toEqual([
      { '(GER) Name': 'GEN 1', 'VIG (média)': 6, 'ALT (média)': 14 },
    ]);
    expect(result.filteredRecordCount).toBe(1);
  });

  it('ignora textos e vazios e pode ocultar genótipos sem média', () => {
    const withValues = aggregateMultiLocation(parsed.records, allFilters, ['VIG'], true);
    const includingEmpty = aggregateMultiLocation(parsed.records, allFilters, ['VIG'], false);

    expect(withValues.rows).toHaveLength(1);
    expect(includingEmpty.rows).toHaveLength(2);
    expect(includingEmpty.rows[1]['VIG (média)']).toBe('');
  });
});
