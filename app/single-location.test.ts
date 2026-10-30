import { describe, expect, it } from 'vitest';
import { analyzeSingleLocationHeaders, mapSingleLocationHeaders } from './single-location';

describe('analyzeSingleLocationHeaders', () => {
  it('aceita o template em inglês sem Pedigree nem Selection history', () => {
    const analysis = analyzeSingleLocationHeaders([
      'UUID',
      'FEID',
      'Name',
      'Entry code',
      'Plot name',
      'Block',
      'VIG',
      'ALT',
    ]);

    expect(analysis.kind).toBe('plots');
    expect(analysis.columns.pedigree).toBeUndefined();
    expect(analysis.columns.history).toBeUndefined();
    expect(analysis.metricColumns).toEqual(['VIG', 'ALT']);
  });

  it('aceita o template de Observations em português', () => {
    const analysis = analyzeSingleLocationHeaders([
      'Nome da observação',
      'Nome',
      'Origem',
      'Bloco',
      'VIG',
      'ALT',
    ]);

    expect(analysis.kind).toBe('observations');
    expect(analysis.columns.observation).toBe('Nome da observação');
    expect(analysis.columns.name).toBe('Nome');
    expect(analysis.columns.plot).toBe('Origem');
    expect(analysis.metricColumns).toEqual(['VIG', 'ALT']);
  });

  it('aceita o template de Plots em português', () => {
    const analysis = analyzeSingleLocationHeaders([
      'FEID',
      'Nome',
      'Código de entrada',
      'Nome da parcela',
      'Repetição',
      'Rendimento',
    ]);

    expect(analysis.kind).toBe('plots');
    expect(analysis.columns.entryCode).toBe('Código de entrada');
    expect(analysis.columns.block).toBe('Repetição');
    expect(analysis.metricColumns).toEqual(['Rendimento']);
  });

  it('trata todas as colunas depois de Block como dados, mesmo se o nome parecer estrutural', () => {
    const analysis = analyzeSingleLocationHeaders([
      'FEID',
      'Name',
      'Entry code',
      'Plot name',
      'Block',
      'Evaluation date',
      'Evaluator',
      'Observation name',
    ]);

    expect(analysis.kind).toBe('plots');
    expect(analysis.columns.observation).toBeUndefined();
    expect(analysis.metricColumns).toEqual(['Evaluation date', 'Evaluator', 'Observation name']);
  });

  it('mantém a lista de métricas vazia enquanto nenhum arquivo foi carregado', () => {
    expect(mapSingleLocationHeaders([]).metricColumns).toEqual([]);
  });

  it('continua exigindo os identificadores essenciais', () => {
    expect(() => analyzeSingleLocationHeaders(['Name', 'Block', 'VIG']))
      .toThrow(/Origin\/Plot name.*Observation name/i);
  });
});
