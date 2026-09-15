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

export type MultiLocationResult = {
  rows: Record<string, MultiLocationCellValue>[];
  headers: string[];
  filteredRecordCount: number;
  numericValueCount: number;
};

const MULTI_LOCATION_ALIASES = {
  entity: ['entity name', 'entity', 'nome do ensaio', 'ensaio'],
  location: ['location', 'local', 'localidade'],
  genotype: ['(ger) name', 'ger name', 'name', 'genotype', 'genotipo', 'genótipo', 'germoplasma'],
  observer: ['(obs) name', 'obs name', 'observation name', 'observation', 'observacao', 'observação', 'observer', 'avaliador'],
  plot: ['plot name', 'origin', 'plot', 'plot id', 'parcela'],
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

function findHeaderIndex(headers: string[], aliases: string[]) {
  const normalizedHeaders = headers.map(normalizeHeader);
  for (const alias of aliases) {
    const index = normalizedHeaders.indexOf(normalizeHeader(alias));
    if (index >= 0) return index;
  }
  return -1;
}

function naturalCompare(a: string, b: string) {
  return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' });
}

export function getMultiLocationValues(records: MultiLocationRecord[], field: 'entity' | 'location' | 'observer') {
  return Array.from(new Set(records.map((record) => record[field].trim()).filter(Boolean))).sort(naturalCompare);
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
    entity: findHeaderIndex(headers, MULTI_LOCATION_ALIASES.entity),
    location: findHeaderIndex(headers, MULTI_LOCATION_ALIASES.location),
    genotype: findHeaderIndex(headers, MULTI_LOCATION_ALIASES.genotype),
    observer: findHeaderIndex(headers, MULTI_LOCATION_ALIASES.observer),
    plot: findHeaderIndex(headers, MULTI_LOCATION_ALIASES.plot),
    block: findHeaderIndex(headers, MULTI_LOCATION_ALIASES.block),
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
