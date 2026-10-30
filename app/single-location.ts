export const SINGLE_LOCATION_ALIASES = {
  observation: [
    'observation name',
    'observation',
    'observacao',
    'observação',
    'nome da observacao',
    'nome da observação',
    'nome de observacao',
    'nome de observação',
    'nome observacao',
    'nome observação',
  ],
  plot: [
    'origin',
    'origem',
    'plot name',
    'nome do gráfico',
    'plot',
    'plot id',
    'parcela',
    'nome da parcela',
    'nome de parcela',
    'id da parcela',
  ],
  name: ['name', 'nome', 'genotype', 'genotipo', 'genótipo', 'nome do genotipo', 'nome do genótipo'],
  pedigree: ['pedigree', 'genealogia'],
  history: ['selection history', 'historico de selecao', 'histórico de seleção', 'historico da selecao', 'histórico da seleção'],
  block: ['block', 'bloco', 'repeticao', 'repetição', 'rep'],
  feid: ['feid'],
  entryCode: [
    'entry code',
    'entrycode',
    'codigo de entrada',
    'código de entrada',
    'codigo da entrada',
    'código da entrada',
    'codigo entrada',
    'código entrada',
    'cod. de entrada',
    'cód. de entrada',
  ],
  row: ['row', 'linha'],
  column: ['column', 'coluna'],
  discarded: ['is discarded', 'discarded', 'descartado', 'descartada', 'esta descartado', 'está descartado', 'esta descartada', 'está descartada'],
  uuid: ['uuid'],
} as const;

export type SingleLocationColumnMap = {
  [Key in keyof typeof SINGLE_LOCATION_ALIASES]: string | undefined;
};

export function normalizeSingleLocationHeader(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function findHeader(headers: string[], aliases: readonly string[]) {
  const normalizedAliases = new Set(aliases.map(normalizeSingleLocationHeader));
  return headers.find((header) => normalizedAliases.has(normalizeSingleLocationHeader(header)));
}

export function mapSingleLocationHeaders(headers: string[]) {
  const block = findHeader(headers, SINGLE_LOCATION_ALIASES.block);
  const blockIndex = block ? headers.indexOf(block) : -1;
  const structuralHeaders = blockIndex >= 0 ? headers.slice(0, blockIndex + 1) : headers;
  const columns = Object.fromEntries(
    Object.entries(SINGLE_LOCATION_ALIASES).map(([key, aliases]) => [key, findHeader(structuralHeaders, aliases)]),
  ) as SingleLocationColumnMap;

  return {
    columns,
    blockIndex,
    metricColumns: blockIndex >= 0 ? headers.slice(blockIndex + 1) : [],
  };
}

export function analyzeSingleLocationHeaders(headers: string[]) {
  const analysis = mapSingleLocationHeaders(headers);
  const { columns } = analysis;
  const isObservationsFile = Boolean(columns.observation);
  const isPlotsFile = !columns.observation && Boolean(columns.feid && columns.entryCode);
  const missing = [
    ...(!columns.name ? ['Name/Nome'] : []),
    ...(!columns.plot ? ['Origin/Plot name ou Origem/Nome da parcela'] : []),
    ...(!columns.block ? ['Block/Bloco'] : []),
    ...(!isObservationsFile && !isPlotsFile
      ? ['Observation name/Nome da observação ou FEID + Entry code/Código de entrada']
      : []),
  ];

  if (missing.length) {
    throw new Error(`Não encontrei as colunas obrigatórias: ${missing.join(', ')}. Confira os cabeçalhos da extração.`);
  }

  return {
    ...analysis,
    kind: isObservationsFile ? 'observations' as const : 'plots' as const,
  };
}
