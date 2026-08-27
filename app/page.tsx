'use client';

import { ChangeEvent, DragEvent, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';

type CellValue = string | number | boolean | Date | null | undefined;
type DataRow = Record<string, CellValue>;
type ViewMode = 'observacoes' | 'parcelas' | 'repeticoes';

const IDENTITY_ALIASES = {
  observation: ['observation name', 'observation', 'observacao', 'observação'],
  plot: ['origin', 'plot', 'plot id', 'parcela'],
  name: ['name', 'genotype', 'genotipo', 'genótipo'],
  pedigree: ['pedigree'],
  history: ['selection history', 'historico de selecao', 'histórico de seleção'],
  block: ['block', 'bloco'],
};

const REQUIRED_IDENTIFIERS = ['Name', 'Pedigree', 'Selection history', 'Origin', 'Block'];

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function isFilled(value: CellValue) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function displayValue(value: CellValue) {
  if (value instanceof Date) return value.toLocaleDateString('pt-BR');
  if (typeof value === 'number') return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 }).format(value);
  if (value === true) return 'Sim';
  if (value === false) return 'Não';
  return String(value ?? '');
}

function findHeader(headers: string[], aliases: string[]) {
  return headers.find((header) => aliases.includes(normalize(header)));
}

function naturalCompare(a: string, b: string) {
  return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' });
}

function toFiniteNumber(value: CellValue) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const normalizedValue = value.trim().replace(',', '.');
  if (!/^-?\d+(?:\.\d+)?$/.test(normalizedValue)) return null;
  const parsed = Number(normalizedValue);
  return Number.isFinite(parsed) ? parsed : null;
}

function blockHeader(value: string) {
  return /^(block|bloco)\b/i.test(value.trim()) ? value.trim() : `Block ${value.trim()}`;
}

function safeFileStem(value: string) {
  return value.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [sheetName, setSheetName] = useState('');
  const [rows, setRows] = useState<DataRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
  const [mode, setMode] = useState<ViewMode>('observacoes');
  const [onlyWithValues, setOnlyWithValues] = useState(true);
  const [search, setSearch] = useState('');
  const [metricSearch, setMetricSearch] = useState('');
  const [typeSearch, setTypeSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');

  const columnMap = useMemo(() => ({
    observation: findHeader(headers, IDENTITY_ALIASES.observation),
    plot: findHeader(headers, IDENTITY_ALIASES.plot),
    name: findHeader(headers, IDENTITY_ALIASES.name),
    pedigree: findHeader(headers, IDENTITY_ALIASES.pedigree),
    history: findHeader(headers, IDENTITY_ALIASES.history),
    block: findHeader(headers, IDENTITY_ALIASES.block),
  }), [headers]);

  const identityColumns = useMemo(() => {
    const preferred = [columnMap.name, columnMap.pedigree, columnMap.history, columnMap.plot, columnMap.block, columnMap.observation];
    return preferred.filter((column): column is string => Boolean(column));
  }, [columnMap]);

  const metricColumns = useMemo(() => {
    const identitySet = new Set([...identityColumns, 'Evaluation date', 'Evaluator'].map(normalize));
    return headers.filter((header) => !identitySet.has(normalize(header)));
  }, [headers, identityColumns]);

  const availableTypes = useMemo(() => {
    if (!columnMap.observation) return [];
    const found = Array.from(new Set(rows.map((row) => String(row[columnMap.observation!] ?? '').trim()).filter(Boolean)));
    return found.sort(naturalCompare);
  }, [rows, columnMap.observation]);

  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (!columnMap.observation) return counts;
    for (const row of rows) {
      const value = String(row[columnMap.observation] ?? '').trim();
      if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return counts;
  }, [rows, columnMap.observation]);

  const metricCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const typeSet = new Set(selectedTypes);
    for (const metric of metricColumns) counts.set(metric, 0);
    for (const row of rows) {
      const type = columnMap.observation ? String(row[columnMap.observation] ?? '').trim() : '';
      if (!typeSet.has(type)) continue;
      for (const metric of metricColumns) if (isFilled(row[metric])) counts.set(metric, (counts.get(metric) ?? 0) + 1);
    }
    return counts;
  }, [rows, metricColumns, selectedTypes, columnMap.observation]);

  const filteredSourceRows = useMemo(() => {
    const typeSet = new Set(selectedTypes);
    const query = normalize(search);
    return rows.filter((row) => {
      const type = columnMap.observation ? String(row[columnMap.observation] ?? '').trim() : '';
      if (!typeSet.has(type)) return false;
      if (onlyWithValues && selectedMetrics.length && !selectedMetrics.some((metric) => isFilled(row[metric]))) return false;
      if (query) {
        const searchable = [columnMap.plot, columnMap.name, columnMap.pedigree]
          .filter((column): column is string => Boolean(column))
          .map((column) => String(row[column] ?? '')).join(' ');
        if (!normalize(searchable).includes(query)) return false;
      }
      return true;
    });
  }, [rows, selectedTypes, selectedMetrics, onlyWithValues, search, columnMap]);

  const pivotMetricColumns = useMemo(() => {
    if (!columnMap.observation) return [];
    const populated = new Set<string>();
    for (const row of filteredSourceRows) {
      const type = String(row[columnMap.observation] ?? '').trim();
      for (const metric of selectedMetrics) if (isFilled(row[metric])) populated.add(`${type} · ${metric}`);
    }
    return selectedTypes.flatMap((type) => selectedMetrics.map((metric) => `${type} · ${metric}`).filter((column) => populated.has(column)));
  }, [filteredSourceRows, selectedMetrics, selectedTypes, columnMap.observation]);

  const availableBlocks = useMemo(() => {
    if (!columnMap.block) return [];
    const found = Array.from(new Set(filteredSourceRows
      .map((row) => String(row[columnMap.block!] ?? '').trim())
      .filter(Boolean)));
    return found.sort(naturalCompare);
  }, [filteredSourceRows, columnMap.block]);

  const repetitionRows = useMemo<DataRow[]>(() => {
    if (!columnMap.name || !columnMap.block || !columnMap.observation) return [];
    type RepetitionGroup = { output: DataRow; valuesByBlock: Map<string, CellValue[]> };
    const groups = new Map<string, RepetitionGroup>();
    const baseColumns = [columnMap.name, columnMap.pedigree, columnMap.history, columnMap.observation]
      .filter((column): column is string => Boolean(column));

    for (const sourceRow of filteredSourceRows) {
      const block = String(sourceRow[columnMap.block] ?? '').trim();
      if (!block) continue;
      for (const metric of selectedMetrics) {
        const value = sourceRow[metric];
        if (onlyWithValues && !isFilled(value)) continue;
        const keyParts = [...baseColumns.map((column) => String(sourceRow[column] ?? '')), metric];
        const key = JSON.stringify(keyParts);
        if (!groups.has(key)) {
          const output: DataRow = {};
          for (const column of baseColumns) output[column] = sourceRow[column];
          output['Variável'] = metric;
          groups.set(key, { output, valuesByBlock: new Map() });
        }
        const group = groups.get(key)!;
        if (!group.valuesByBlock.has(block)) group.valuesByBlock.set(block, []);
        if (isFilled(value)) group.valuesByBlock.get(block)!.push(value);
      }
    }

    return Array.from(groups.values()).map(({ output, valuesByBlock }) => {
      const numericBlockValues: number[] = [];
      for (const block of availableBlocks) {
        const values = valuesByBlock.get(block) ?? [];
        const numbers = values.map(toFiniteNumber);
        const allNumeric = values.length > 0 && numbers.every((value) => value !== null);
        let summarized: CellValue = '';
        if (allNumeric) {
          summarized = (numbers as number[]).reduce((sum, value) => sum + value, 0) / numbers.length;
          numericBlockValues.push(summarized as number);
        } else if (values.length) {
          summarized = Array.from(new Set(values.map(displayValue))).join(' | ');
        }
        output[blockHeader(block)] = summarized;
      }
      output['Média'] = numericBlockValues.length
        ? numericBlockValues.reduce((sum, value) => sum + value, 0) / numericBlockValues.length
        : '';
      return output;
    });
  }, [filteredSourceRows, selectedMetrics, onlyWithValues, availableBlocks, columnMap]);

  const resultRows = useMemo<DataRow[]>(() => {
    if (mode === 'observacoes') {
      return filteredSourceRows.map((row) => {
        const output: DataRow = {};
        for (const column of identityColumns) output[column] = row[column];
        for (const metric of selectedMetrics) output[metric] = row[metric];
        return output;
      });
    }
    if (mode === 'repeticoes') return repetitionRows;
    if (!columnMap.plot || !columnMap.observation) return [];
    const groups = new Map<string, DataRow>();
    for (const row of filteredSourceRows) {
      const plot = String(row[columnMap.plot] ?? '').trim();
      if (!groups.has(plot)) {
        const base: DataRow = {};
        for (const column of identityColumns.filter((column) => column !== columnMap.observation)) base[column] = row[column];
        groups.set(plot, base);
      }
      const output = groups.get(plot)!;
      const type = String(row[columnMap.observation] ?? '').trim();
      for (const metric of selectedMetrics) {
        const key = `${type} · ${metric}`;
        if (pivotMetricColumns.includes(key) && isFilled(row[metric])) output[key] = row[metric];
      }
    }
    return Array.from(groups.values());
  }, [mode, filteredSourceRows, identityColumns, selectedMetrics, columnMap, pivotMetricColumns, repetitionRows]);

  const resultHeaders = useMemo(() => {
    if (mode === 'observacoes') return [...identityColumns, ...selectedMetrics];
    if (mode === 'repeticoes') {
      const base = [columnMap.name, columnMap.pedigree, columnMap.history, columnMap.observation]
        .filter((column): column is string => Boolean(column));
      return [...base, 'Variável', ...availableBlocks.map(blockHeader), 'Média'];
    }
    return [...identityColumns.filter((column) => column !== columnMap.observation), ...pivotMetricColumns];
  }, [mode, identityColumns, selectedMetrics, pivotMetricColumns, availableBlocks, columnMap]);

  const totalPlots = useMemo(() => columnMap.plot
    ? new Set(rows.map((row) => String(row[columnMap.plot!] ?? '')).filter(Boolean)).size : 0,
  [rows, columnMap.plot]);

  const noteCount = useMemo(() => filteredSourceRows.reduce((total, row) => total + selectedMetrics.filter((metric) => isFilled(row[metric])).length, 0), [filteredSourceRows, selectedMetrics]);
  const pageSize = 50;
  const totalPages = Math.max(1, Math.ceil(resultRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = resultRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  async function loadFile(file: File) {
    setLoading(true);
    setError('');
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array', cellDates: true });
      const firstSheet = workbook.SheetNames[0];
      if (!firstSheet) throw new Error('A planilha não possui abas legíveis.');
      const matrix = XLSX.utils.sheet_to_json<CellValue[]>(workbook.Sheets[firstSheet], { header: 1, defval: '', raw: true });
      const rawHeaders = (matrix[0] ?? []).map((value, index) => String(value || `Coluna ${index + 1}`).trim());
      const observationColumn = findHeader(rawHeaders, IDENTITY_ALIASES.observation);
      const plotColumn = findHeader(rawHeaders, IDENTITY_ALIASES.plot);
      const missingIdentifiers = REQUIRED_IDENTIFIERS.filter((required) => !rawHeaders.some((header) => normalize(header) === normalize(required)));
      if (!observationColumn || !plotColumn || missingIdentifiers.length) {
        const missing = [...missingIdentifiers, ...(!observationColumn ? ['Observation name'] : [])];
        throw new Error(`Não encontrei as colunas obrigatórias: ${missing.join(', ')}. Confira os cabeçalhos da extração.`);
      }
      const parsedRows = matrix.slice(1).filter((row) => row.some(isFilled)).map((values) => Object.fromEntries(rawHeaders.map((header, index) => [header, values[index] ?? ''])) as DataRow);
      const types = Array.from(new Set(parsedRows.map((row) => String(row[observationColumn] ?? '').trim()).filter(Boolean))).sort(naturalCompare);
      const fixedColumns = new Set([...Object.values(IDENTITY_ALIASES).flat(), 'evaluation date', 'evaluator']);
      const metrics = rawHeaders.filter((header) => !fixedColumns.has(normalize(header)));
      const populatedMetrics = metrics.filter((metric) => parsedRows.some((row) => isFilled(row[metric])));
      setFileName(file.name);
      setSheetName(firstSheet);
      setHeaders(rawHeaders);
      setRows(parsedRows);
      setSelectedTypes(types);
      setSelectedMetrics(populatedMetrics);
      setMode('observacoes');
      setOnlyWithValues(true);
      setSearch('');
      setMetricSearch('');
      setTypeSearch('');
      setPage(1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível ler esse arquivo.');
      setRows([]);
      setHeaders([]);
    } finally {
      setLoading(false);
    }
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void loadFile(file);
    event.target.value = '';
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void loadFile(file);
  }

  function toggleType(type: string) {
    setSelectedTypes((current) => current.includes(type) ? current.filter((item) => item !== type) : [...current, type]);
    setPage(1);
  }

  function toggleMetric(metric: string) {
    setSelectedMetrics((current) => current.includes(metric) ? current.filter((item) => item !== metric) : [...current, metric]);
    setPage(1);
  }

  function exportData(format: 'xlsx' | 'csv') {
    if (!resultRows.length) return;
    const sheet = XLSX.utils.json_to_sheet(resultRows, { header: resultHeaders });
    const stem = safeFileStem(fileName) || 'phenome';
    if (format === 'xlsx') {
      const workbook = XLSX.utils.book_new();
      const exportSheetName = mode === 'parcelas' ? 'Por parcela' : mode === 'repeticoes' ? 'Repetições' : 'Observações';
      XLSX.utils.book_append_sheet(workbook, sheet, exportSheetName);
      XLSX.writeFile(workbook, `${stem}_filtrado.xlsx`);
    } else {
      const csv = XLSX.utils.sheet_to_csv(sheet, { FS: ';' });
      const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${stem}_filtrado.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    }
  }

  const visibleMetricOptions = metricColumns.filter((metric) => normalize(metric).includes(normalize(metricSearch)));
  const visibleTypeOptions = availableTypes.filter((type) => normalize(type).includes(normalize(typeSearch)));

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true"><span>P</span></div>
        <div><p className="eyebrow">Phenome · Field observations</p><h1>Organizador de notas de parcelas</h1></div>
        <div className="privacy-badge"><span className="privacy-dot" /> Processamento local</div>
      </header>

      <section className="intro">
        <div><span className="step-label">01 · Importar</span><h2>Transforme sua extração em uma tabela pronta para análise.</h2><p>O app usa Name, Pedigree, Selection history, Origin e Block como identificadores da parcela e cria os filtros a partir dos valores encontrados em Observation name.</p></div>
        <div className={`dropzone ${dragging ? 'is-dragging' : ''} ${rows.length ? 'has-file' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={handleDrop}>
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleInput} aria-label="Selecionar arquivo do Phenome" />
          <div className="file-icon" aria-hidden="true">XLS</div>
          <div className="drop-copy"><strong>{loading ? 'Lendo a planilha…' : rows.length ? fileName : 'Arraste o arquivo para cá'}</strong><span>{rows.length ? `${rows.length.toLocaleString('pt-BR')} registros · aba ${sheetName}` : 'ou selecione um arquivo .xlsx, .xls ou .csv'}</span></div>
          <button className="button primary" type="button" onClick={() => inputRef.current?.click()} disabled={loading}>{rows.length ? 'Trocar arquivo' : 'Selecionar arquivo'}</button>
        </div>
        {error && <p className="error-message" role="alert">{error}</p>}
      </section>

      {!rows.length ? (
        <section className="empty-preview" aria-label="Como funciona">
          <div className="preview-head"><span className="step-label">02 · Filtrar e transformar</span><span className="preview-pill">Segmentação criada automaticamente por Observation name</span></div>
          <div className="preview-grid">
            <article><span>1</span><h3>Importe</h3><p>A ferramenta identifica os valores existentes em Observation name, sejam códigos, textos ou números.</p></article>
            <article><span>2</span><h3>Segmente</h3><p>Escolha qualquer combinação de valores e notas, sem depender de uma lista predefinida.</p></article>
            <article><span>3</span><h3>Exporte</h3><p>Baixe em Excel ou CSV por observação, por parcela ou comparando as repetições de cada genótipo.</p></article>
          </div>
        </section>
      ) : (
        <section className="workspace">
          <aside className="filters">
            <div className="section-heading"><span className="step-label">02 · Configurar</span><button className="text-button" type="button" onClick={() => { setSelectedTypes(availableTypes); setSelectedMetrics(metricColumns.filter((metric) => (metricCounts.get(metric) ?? 0) > 0)); setSearch(''); setTypeSearch(''); }}>Restaurar</button></div>
            <div className="filter-group">
              <div className="filter-title"><label>Segmentação · Observation name</label><span>{selectedTypes.length}/{availableTypes.length}</span></div>
              {availableTypes.length > 8 && <input id="type-search" className="search-input" value={typeSearch} onChange={(event) => setTypeSearch(event.target.value)} placeholder="Buscar valor…" />}
              <div className="quick-actions"><button type="button" onClick={() => setSelectedTypes(availableTypes)}>Todos</button><button type="button" onClick={() => setSelectedTypes([])}>Limpar</button><span className="detected-values">{availableTypes.length} valores detectados</span></div>
              <div className="type-grid">{visibleTypeOptions.map((type) => <button key={type} type="button" className={`type-chip ${selectedTypes.includes(type) ? 'selected' : ''}`} onClick={() => toggleType(type)} aria-pressed={selectedTypes.includes(type)} title={type}><span>{type}</span><small>{(typeCounts.get(type) ?? 0).toLocaleString('pt-BR')}</small></button>)}</div>
            </div>
            <div className="filter-group">
              <div className="filter-title"><label htmlFor="metric-search">Colunas de valores</label><span>{selectedMetrics.length}/{metricColumns.length}</span></div>
              <input id="metric-search" className="search-input" value={metricSearch} onChange={(event) => setMetricSearch(event.target.value)} placeholder="Buscar coluna…" />
              <div className="quick-actions"><button type="button" onClick={() => setSelectedMetrics(metricColumns.filter((metric) => (metricCounts.get(metric) ?? 0) > 0))}>Com dados</button><button type="button" onClick={() => setSelectedMetrics(metricColumns)}>Todas</button><button type="button" onClick={() => setSelectedMetrics([])}>Limpar</button></div>
              <div className="metric-list">{visibleMetricOptions.map((metric) => (
                <label key={metric} className="metric-option"><input type="checkbox" checked={selectedMetrics.includes(metric)} onChange={() => toggleMetric(metric)} /><span className="custom-check" aria-hidden="true">✓</span><span className="metric-name">{metric}</span><span className={`count-badge ${(metricCounts.get(metric) ?? 0) > 0 ? 'has-count' : ''}`}>{(metricCounts.get(metric) ?? 0).toLocaleString('pt-BR')}</span></label>
              ))}</div>
            </div>
            <label className="toggle-row"><span><strong>Somente linhas com nota</strong><small>Oculta registros vazios nas colunas escolhidas</small></span><input type="checkbox" checked={onlyWithValues} onChange={(event) => { setOnlyWithValues(event.target.checked); setPage(1); }} /><span className="toggle" aria-hidden="true" /></label>
          </aside>

          <div className="results">
            <div className="results-toolbar"><div><span className="step-label">03 · Visualizar e exportar</span><h2>Tabela transformada</h2></div><div className="view-switch" aria-label="Formato da tabela"><button type="button" className={mode === 'observacoes' ? 'active' : ''} onClick={() => { setMode('observacoes'); setPage(1); }}>Por observação</button><button type="button" className={mode === 'parcelas' ? 'active' : ''} onClick={() => { setMode('parcelas'); setPage(1); }}>Por parcela</button><button type="button" className={mode === 'repeticoes' ? 'active' : ''} onClick={() => { setMode('repeticoes'); setPage(1); }}>Por repetições</button></div></div>
            {mode === 'repeticoes' && <p className="view-description"><strong>{availableBlocks.length} {availableBlocks.length === 1 ? 'Block detectado' : 'Blocks detectados'}.</strong> Cada linha combina genótipo, observação e variável; a média considera os Blocks com valores numéricos disponíveis.</p>}
            <div className="stats-row"><div><span>Parcelas na base</span><strong>{totalPlots.toLocaleString('pt-BR')}</strong></div><div><span>Linhas no resultado</span><strong>{resultRows.length.toLocaleString('pt-BR')}</strong></div><div><span>Notas encontradas</span><strong>{noteCount.toLocaleString('pt-BR')}</strong></div><div className="search-box"><label htmlFor="row-search">Buscar parcela ou genótipo</label><input id="row-search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Ex.: 39701 ou WBC…" /></div></div>
            {selectedMetrics.length === 0 ? <div className="table-message"><strong>Escolha pelo menos uma coluna de valores.</strong><span>Use a lista à esquerda para montar a tabela.</span></div> : resultRows.length === 0 ? <div className="table-message"><strong>Nenhuma nota encontrada com esses filtros.</strong><span>Tente outro tipo de observação ou desative “Somente linhas com nota”.</span></div> : (
              <><div className="table-wrap"><table><thead><tr>{resultHeaders.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{pageRows.map((row, rowIndex) => <tr key={`${currentPage}-${rowIndex}`}>{resultHeaders.map((header) => <td key={header} className={isFilled(row[header]) ? '' : 'empty-cell'}>{displayValue(row[header]) || '—'}</td>)}</tr>)}</tbody></table></div>
              <div className="table-footer"><span>Mostrando {((currentPage - 1) * pageSize + 1).toLocaleString('pt-BR')}–{Math.min(currentPage * pageSize, resultRows.length).toLocaleString('pt-BR')} de {resultRows.length.toLocaleString('pt-BR')}</span><div className="pagination"><button type="button" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button><span>{currentPage} / {totalPages}</span><button type="button" disabled={currentPage === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Próxima</button></div><div className="export-actions"><button className="button secondary" type="button" onClick={() => exportData('csv')}>Baixar CSV</button><button className="button primary" type="button" onClick={() => exportData('xlsx')}>Baixar Excel</button></div></div></>
            )}
          </div>
        </section>
      )}
      <footer><span>Phenome OBS</span><p>Ferramenta local para organizar observações de campo.</p></footer>
    </main>
  );
}
