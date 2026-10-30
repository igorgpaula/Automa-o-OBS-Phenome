export type MultiLocationCellValue = string | number | boolean | Date | null | undefined;

export type MultiLocationRecord = {
  entity: string;
  location: string;
  genotype: string;
  observer: string;
  plot: string;
  block: string;
  metrics: Record<string, MultiLocationCellValue>;
};

export type MultiLocationDataset = {
  records: MultiLocationRecord[];
  metricNames: string[];
};

export type MultiLocationFilters = {
  entities: string[];
  locations: string[];
  observers: string[];
};

export type MultiLocationDimension = 'entity' | 'location' | 'observer';

export type BlockInferenceSummary = {
  inferredPlots: number;
  inferredRecords: number;
  pendingGroups: Array<{
    location: string;
    entity: string;
    genotype: string;
    pendingRecords: number;
    reasons: Array<'conflict' | 'missing-identifiers'>;
  }>;
};

// Keep source labels in Parcelas, but combine numerically equivalent Blocks in Rep by Rep.
function repetitionBlock(block: string) {
  const number = toMultiLocationNumber(block);
  return number !== null && Number.isInteger(number) && number > 0 ? String(number) : block.trim();
}

export function inferMissingBlocks(input: MultiLocationRecord[]): { records: MultiLocationRecord[]; summary: BlockInferenceSummary } {
  const records = input.map((record) => ({ ...record }));
  const summary: BlockInferenceSummary = { inferredPlots: 0, inferredRecords: 0, pendingGroups: [] };
  const groups = new Map<string, MultiLocationRecord[]>();
  for (const record of records) {
    const key = JSON.stringify([record.location.trim(), record.entity.trim(), record.genotype.trim()]);
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    if (!group.some((record) => !record.block.trim())) continue;
    const { location, entity, genotype } = group[0];
    const hasGroupIdentity = [location, entity, genotype].every((value) => value.trim());
    const eligible = hasGroupIdentity ? group.filter((record) => record.plot.trim()) : [];
    const plots = Array.from(new Set(eligible.map((record) => record.plot.trim())))
      .sort((a, b) => naturalCompare(a, b) || (a < b ? -1 : a > b ? 1 : 0));
    const ranks = new Map(plots.map((plot, index) => [plot, index + 1]));
    const conflict = eligible.some((record) => record.block.trim()
      && toMultiLocationNumber(record.block) !== ranks.get(record.plot.trim()));
    const inferredPlots = new Set<string>();
    if (!conflict) {
      for (const record of eligible) {
        if (record.block.trim()) continue;
        record.block = String(ranks.get(record.plot.trim()));
        inferredPlots.add(record.plot.trim());
        summary.inferredRecords++;
      }
    }
    summary.inferredPlots += inferredPlots.size;
    const pending = group.filter((record) => !record.block.trim());
    if (pending.length) {
      const reasons: BlockInferenceSummary['pendingGroups'][number]['reasons'] = [];
      if (conflict) reasons.push('conflict');
      if (pending.some((record) => !hasGroupIdentity || !record.plot.trim())) reasons.push('missing-identifiers');
      summary.pendingGroups.push({ location, entity, genotype, pendingRecords: pending.length, reasons });
    }
  }
  return { records, summary };
}

export type RepetitionSelection = { metric: string; location: string; entity: string; observer: string };

export function resolveRepetitionSelection(records: MultiLocationRecord[], metrics: string[], requested: Partial<RepetitionSelection> = {}) {
  const counts = getNumericMetricCounts(records, metrics);
  const metricOptions = metrics.filter((metric) => (counts.get(metric) ?? 0) > 0);
  const choose = (options: string[], value?: string) => value !== undefined && options.includes(value) ? value : options[0] ?? '';
  const metric = choose(metricOptions, requested.metric);
  const numericRecords = records.filter((record) => hasNumericMetric(record, [metric]));
  const locations = getMultiLocationValues(numericRecords, 'location');
  const location = choose(locations, requested.location);
  const localRecords = numericRecords.filter((record) => record.location === location);
  const entities = getMultiLocationValues(localRecords, 'entity');
  const entity = choose(entities, requested.entity);
  const observers = getMultiLocationValues(localRecords.filter((record) => record.entity === entity), 'observer');
  const observer = choose(observers, requested.observer);
  return { selection: { metric, location, entity, observer }, options: { metric: metricOptions, location: locations, entity: entities, observer: observers } };
}

export function aggregateRepetitions(records: MultiLocationRecord[], selection: RepetitionSelection): MultiLocationResult {
  const filtered = selection.metric ? records.filter((record) => record.genotype
    && record.location === selection.location && record.entity === selection.entity && record.observer === selection.observer) : [];
  const blocks = Array.from(new Set(filtered.map((record) => repetitionBlock(record.block)).filter(Boolean))).sort(naturalCompare);
  const repLabel = (block: string) => /^\d+$/.test(block) ? `Rep${block}` : `Rep ${block}`;
  const showUnassigned = filtered.some((record) => !record.block.trim());
  const groups = new Map<string, Map<string, { sum: number; count: number }>>();
  let numericValueCount = 0;
  for (const record of filtered) {
    if (!groups.has(record.genotype)) groups.set(record.genotype, new Map());
    const value = toMultiLocationNumber(record.metrics[selection.metric]);
    if (value === null) continue;
    const group = groups.get(record.genotype)!;
    const block = repetitionBlock(record.block);
    const accumulator = group.get(block) ?? { sum: 0, count: 0 };
    accumulator.sum += value;
    accumulator.count++;
    group.set(block, accumulator);
    numericValueCount++;
  }
  const rows = Array.from(groups.entries()).sort(([a], [b]) => naturalCompare(a, b)).map(([genotype, group]) => {
    const row: Record<string, MultiLocationCellValue> = { 'Genótipo': genotype };
    const means: number[] = [];
    for (const block of blocks) {
      const value = group.get(block);
      row[repLabel(block)] = value ? value.sum / value.count : '';
      if (value) means.push(value.sum / value.count);
    }
    if (showUnassigned) {
      const value = group.get('');
      row['Sem Block'] = value ? value.sum / value.count : '';
    }
    row['Média'] = means.length ? means.reduce((sum, value) => sum + value, 0) / means.length : '';
    return row;
  });
  return { rows, headers: ['Genótipo', ...blocks.map(repLabel), ...(showUnassigned ? ['Sem Block'] : []), 'Média'], filteredRecordCount: filtered.length, numericValueCount };
}

export type MultiLocationResult = {
  rows: Record<string, MultiLocationCellValue>[];
  headers: string[];
  filteredRecordCount: number;
  numericValueCount: number;
};

const MULTI_LOCATION_ALIASES = {
  entity: ['entity name', 'entity', 'nome da entidade', 'nome de entidade', 'entidade', 'nome do ensaio', 'ensaio'],
  location: ['location', 'local', 'localidade', 'localizacao', 'localização'],
  genotype: ['(ger) name', 'ger name', '(ger) nome', 'nome (ger)', 'nome ger', 'name', 'genotype', 'genotipo', 'genótipo', 'germoplasma'],
  observer: ['(obs) name', 'obs name', '(obs) nome', 'nome (obs)', 'nome obs', 'observation name', 'observation', 'observacao', 'observação', 'observer', 'avaliador'],
  plot: ['plot name', 'nome do gráfico', 'nome do plot', 'nome de plot', 'origin', 'plot', 'plot id', 'parcela', 'nome da parcela', 'nome de parcela'],
  block: ['block', 'bloco', 'repeticao', 'repetição', 'rep'],
};

export function normalizeHeader(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function isMultiLocationFilled(value: MultiLocationCellValue) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

export function toMultiLocationNumber(value: MultiLocationCellValue) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const normalizedValue = value.trim().replace(',', '.');
  if (!/^-?\d+(?:\.\d+)?$/.test(normalizedValue)) return null;
  const parsed = Number(normalizedValue);
  return Number.isFinite(parsed) ? parsed : null;
}

type MultiLocationColumn = keyof typeof MULTI_LOCATION_ALIASES;

function hasAnyToken(tokens: Set<string>, candidates: string[]) {
  return candidates.some((candidate) => tokens.has(candidate));
}

function matchesHeaderMeaning(header: string, column: MultiLocationColumn) {
  const tokens = new Set(normalizeHeader(header)
    .replace(/[()[\]{}._/-]+/g, ' ')
    .split(' ')
    .filter(Boolean));
  const hasName = hasAnyToken(tokens, ['name', 'nome']);

  if (column === 'entity') return hasName && hasAnyToken(tokens, ['entity', 'entidade']);
  if (column === 'location') return hasAnyToken(tokens, ['location', 'local', 'localidade', 'localizacao']);
  if (column === 'genotype') return hasName && tokens.has('ger');
  if (column === 'observer') return hasName && tokens.has('obs');
  if (column === 'plot') return hasName && hasAnyToken(tokens, ['plot', 'parcela']);
  return false;
}

function findHeaderIndex(headers: string[], column: MultiLocationColumn) {
  const normalizedHeaders = headers.map(normalizeHeader);
  for (const alias of MULTI_LOCATION_ALIASES[column]) {
    const index = normalizedHeaders.indexOf(normalizeHeader(alias));
    if (index >= 0) return index;
  }
  return headers.findIndex((header) => matchesHeaderMeaning(header, column));
}

function naturalCompare(a: string, b: string) {
  return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' });
}

export function getMultiLocationValues(records: MultiLocationRecord[], field: 'entity' | 'location' | 'observer') {
  return Array.from(new Set(records.map((record) => record[field].trim()).filter(Boolean))).sort(naturalCompare);
}

export function hasNumericMetric(record: MultiLocationRecord, metricNames: string[]) {
  return metricNames.some((metric) => toMultiLocationNumber(record.metrics[metric]) !== null);
}

export function getMultiLocationFacetCounts(records: MultiLocationRecord[], field: MultiLocationDimension) {
  const counts = new Map<string, number>();
  for (const record of records) {
    const value = record[field].trim();
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

export function getNumericMetricCounts(records: MultiLocationRecord[], metricNames: string[]) {
  const counts = new Map(metricNames.map((metric) => [metric, 0]));
  for (const record of records) {
    for (const metric of metricNames) {
      if (toMultiLocationNumber(record.metrics[metric]) !== null) {
        counts.set(metric, (counts.get(metric) ?? 0) + 1);
      }
    }
  }
  return counts;
}

export function parseMultiLocationMatrix(matrix: MultiLocationCellValue[][]): MultiLocationDataset {
  if (!matrix.length || !matrix[0]?.length) {
    throw new Error('A primeira aba da planilha está vazia.');
  }

  const headers = matrix[0].map((value, index) => String(value ?? '').trim() || `Coluna ${index + 1}`);
  const columnIndexes = {
    entity: findHeaderIndex(headers, 'entity'),
    location: findHeaderIndex(headers, 'location'),
    genotype: findHeaderIndex(headers, 'genotype'),
    observer: findHeaderIndex(headers, 'observer'),
    plot: findHeaderIndex(headers, 'plot'),
    block: findHeaderIndex(headers, 'block'),
  };

  const requiredColumns: Array<[keyof typeof columnIndexes, string]> = [
    ['entity', 'Entity name'],
    ['location', 'Location'],
    ['genotype', '(GER) Name'],
    ['observer', '(OBS) Name'],
    ['plot', 'Plot name'],
    ['block', 'Block'],
  ];
  const missing = requiredColumns.filter(([key]) => columnIndexes[key] < 0).map(([, label]) => label);
  if (missing.length) {
    throw new Error(`Não encontrei as colunas obrigatórias: ${missing.join(', ')}.`);
  }

  const columnsAfterBlock = requiredColumns
    .filter(([key]) => key !== 'block' && columnIndexes[key] > columnIndexes.block)
    .map(([, label]) => label);
  if (columnsAfterBlock.length) {
    throw new Error(`${columnsAfterBlock.join(', ')} precisa estar antes da coluna Block.`);
  }

  const metricNames = headers.slice(columnIndexes.block + 1);
  if (!metricNames.length) {
    throw new Error('Não encontrei variáveis depois da coluna Block.');
  }

  const seenMetricNames = new Map<string, string>();
  const duplicateMetrics: string[] = [];
  for (const metric of metricNames) {
    const normalized = normalizeHeader(metric);
    if (seenMetricNames.has(normalized)) duplicateMetrics.push(metric);
    else seenMetricNames.set(normalized, metric);
  }
  if (duplicateMetrics.length) {
    throw new Error(`Existem variáveis duplicadas depois de Block: ${Array.from(new Set(duplicateMetrics)).join(', ')}.`);
  }

  const records = matrix
    .slice(1)
    .filter((row) => row.some(isMultiLocationFilled))
    .map((row) => {
      const metrics: Record<string, MultiLocationCellValue> = {};
      metricNames.forEach((metric, offset) => {
        metrics[metric] = row[columnIndexes.block + 1 + offset] ?? '';
      });
      return {
        entity: String(row[columnIndexes.entity] ?? '').trim(),
        location: String(row[columnIndexes.location] ?? '').trim(),
        genotype: String(row[columnIndexes.genotype] ?? '').trim(),
        observer: String(row[columnIndexes.observer] ?? '').trim(),
        plot: String(row[columnIndexes.plot] ?? '').trim(),
        block: String(row[columnIndexes.block] ?? '').trim(),
        metrics,
      };
    });

  if (!records.length) {
    throw new Error('A planilha não possui registros de dados.');
  }

  return { records, metricNames };
}

export function aggregateMultiLocation(
  records: MultiLocationRecord[],
  filters: MultiLocationFilters,
  selectedMetrics: string[],
  onlyWithValues = true,
): MultiLocationResult {
  const entitySet = new Set(filters.entities);
  const locationSet = new Set(filters.locations);
  const observerSet = new Set(filters.observers);
  const filteredRecords = records.filter((record) => (
    record.genotype
    && entitySet.has(record.entity)
    && locationSet.has(record.location)
    && observerSet.has(record.observer)
  ));

  type MetricAccumulator = { sum: number; count: number };
  type GenotypeAccumulator = { genotype: string; metrics: Map<string, MetricAccumulator> };
  const groups = new Map<string, GenotypeAccumulator>();
  let numericValueCount = 0;

  for (const record of filteredRecords) {
    if (!groups.has(record.genotype)) {
      groups.set(record.genotype, { genotype: record.genotype, metrics: new Map() });
    }
    const group = groups.get(record.genotype)!;
    for (const metric of selectedMetrics) {
      const value = toMultiLocationNumber(record.metrics[metric]);
      if (value === null) continue;
      const accumulator = group.metrics.get(metric) ?? { sum: 0, count: 0 };
      accumulator.sum += value;
      accumulator.count += 1;
      group.metrics.set(metric, accumulator);
      numericValueCount += 1;
    }
  }

  const rows = Array.from(groups.values())
    .filter((group) => !onlyWithValues || selectedMetrics.some((metric) => (group.metrics.get(metric)?.count ?? 0) > 0))
    .sort((a, b) => naturalCompare(a.genotype, b.genotype))
    .map((group) => {
      const output: Record<string, MultiLocationCellValue> = { '(GER) Name': group.genotype };
      for (const metric of selectedMetrics) {
        const accumulator = group.metrics.get(metric);
        output[`${metric} (média)`] = accumulator?.count ? accumulator.sum / accumulator.count : '';
      }
      return output;
    });

  return {
    rows,
    headers: ['(GER) Name', ...selectedMetrics.map((metric) => `${metric} (média)`) ],
    filteredRecordCount: filteredRecords.length,
    numericValueCount,
  };
}

export function listMultiLocationRecords(
  records: MultiLocationRecord[],
  filters: MultiLocationFilters,
  selectedMetrics: string[],
): MultiLocationResult {
  const entitySet = new Set(filters.entities);
  const locationSet = new Set(filters.locations);
  const observerSet = new Set(filters.observers);
  const filteredRecords = records.filter((record) => (
    record.genotype
    && entitySet.has(record.entity)
    && locationSet.has(record.location)
    && observerSet.has(record.observer)
    && hasNumericMetric(record, selectedMetrics)
  ));
  const showBlock = filteredRecords.some((record) => isMultiLocationFilled(record.block));
  const headers = [
    'Location',
    'Entity name',
    '(GER) Name',
    '(OBS) Name',
    'Plot name',
    ...(showBlock ? ['Block'] : []),
    ...selectedMetrics,
  ];
  let numericValueCount = 0;

  const rows = filteredRecords
    .slice()
    .sort((a, b) => (
      naturalCompare(a.location, b.location)
      || naturalCompare(a.entity, b.entity)
      || naturalCompare(a.genotype, b.genotype)
      || naturalCompare(a.plot, b.plot)
      || naturalCompare(a.block, b.block)
      || naturalCompare(a.observer, b.observer)
    ))
    .map((record) => {
      const output: Record<string, MultiLocationCellValue> = {
        Location: record.location,
        'Entity name': record.entity,
        '(GER) Name': record.genotype,
        '(OBS) Name': record.observer,
        'Plot name': record.plot,
      };
      if (showBlock) output.Block = record.block;
      for (const metric of selectedMetrics) {
        const value = record.metrics[metric];
        output[metric] = value;
        if (toMultiLocationNumber(value) !== null) numericValueCount += 1;
      }
      return output;
    });

  return {
    rows,
    headers,
    filteredRecordCount: filteredRecords.length,
    numericValueCount,
  };
}
