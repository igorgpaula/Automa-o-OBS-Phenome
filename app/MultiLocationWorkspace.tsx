'use client';

import { ChangeEvent, DragEvent, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  aggregateMultiLocation,
  getMultiLocationFacetCounts,
  getMultiLocationValues,
  getNumericMetricCounts,
  hasNumericMetric,
  isMultiLocationFilled,
  listMultiLocationRecords,
  MultiLocationCellValue,
  MultiLocationRecord,
  normalizeHeader,
  parseMultiLocationMatrix,
  toMultiLocationNumber,
} from './multi-location';

type SortConfig = { header: string; direction: 'asc' | 'desc' } | null;
type CopyStatus = 'idle' | 'copied' | 'error';
type TableMode = 'averages' | 'plots';
type SegmentOption = { value: string; count: number };

type SegmentFilterProps = {
  label: string;
  options: SegmentOption[];
  selected: string[];
  search: string;
  onSearch: (value: string) => void;
  onChange: (values: string[]) => void;
  onResetTable: () => void;
};

function displayValue(value: MultiLocationCellValue) {
  if (value instanceof Date) return value.toLocaleDateString('pt-BR');
  if (typeof value === 'number') return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 }).format(value);
  if (value === true) return 'Sim';
  if (value === false) return 'Não';
  return String(value ?? '');
}

function compareCellValues(a: MultiLocationCellValue, b: MultiLocationCellValue) {
  const aNumber = toMultiLocationNumber(a);
  const bNumber = toMultiLocationNumber(b);
  if (aNumber !== null && bNumber !== null) return aNumber - bNumber;
  return displayValue(a).localeCompare(displayValue(b), 'pt-BR', { numeric: true, sensitivity: 'base' });
}

function safeFileStem(value: string) {
  return value.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
}

function SegmentFilter({ label, options, selected, search, onSearch, onChange, onResetTable }: SegmentFilterProps) {
  const enabledOptions = options.filter((option) => option.count > 0);
  const selectedEnabledCount = enabledOptions.filter((option) => selected.includes(option.value)).length;
  const visibleOptions = options.filter((option) => normalizeHeader(option.value).includes(normalizeHeader(search)));

  function toggle(value: string, count: number) {
    if (count === 0) return;
    onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
    onResetTable();
  }

  return (
    <div className="filter-group segment-filter">
      <div className="filter-title"><label>{label}</label><span>{selectedEnabledCount}/{enabledOptions.length}</span></div>
      <input className="search-input" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Buscar valor…" aria-label={`Buscar em ${label}`} />
      <div className="quick-actions">
        <button type="button" onClick={() => { onChange(enabledOptions.map((option) => option.value)); onResetTable(); }} disabled={!enabledOptions.length}>Todos</button>
        <button type="button" onClick={() => { onChange([]); onResetTable(); }}>Limpar</button>
        <span className="detected-values">{enabledOptions.length} com dados</span>
      </div>
      <div className="segment-grid">
        {visibleOptions.map(({ value, count }) => (
          <button key={value} type="button" className={`segment-chip ${selected.includes(value) && count > 0 ? 'selected' : ''}`} onClick={() => toggle(value, count)} aria-pressed={selected.includes(value) && count > 0} disabled={count === 0}>
            <span>{value}</span><span className="segment-count">{count.toLocaleString('pt-BR')}</span>
          </button>
        ))}
        {!visibleOptions.length && <span className="empty-filter-list">Nenhum valor encontrado.</span>}
      </div>
    </div>
  );
}

export default function MultiLocationWorkspace() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [sheetName, setSheetName] = useState('');
  const [records, setRecords] = useState<MultiLocationRecord[]>([]);
  const [metricNames, setMetricNames] = useState<string[]>([]);
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [selectedObservers, setSelectedObservers] = useState<string[]>([]);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
  const [tableMode, setTableMode] = useState<TableMode>('averages');
  const [onlyWithValues, setOnlyWithValues] = useState(true);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [entitySearch, setEntitySearch] = useState('');
  const [locationSearch, setLocationSearch] = useState('');
  const [observerSearch, setObserverSearch] = useState('');
  const [metricSearch, setMetricSearch] = useState('');
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');

  const availableEntities = useMemo(() => getMultiLocationValues(records, 'entity'), [records]);
  const availableLocations = useMemo(() => getMultiLocationValues(records, 'location'), [records]);
  const availableObservers = useMemo(() => getMultiLocationValues(records, 'observer'), [records]);

  const metricCounts = useMemo(() => getNumericMetricCounts(records, metricNames), [records, metricNames]);
  const recordsWithSelectedMetricData = useMemo(
    () => selectedMetrics.length ? records.filter((record) => hasNumericMetric(record, selectedMetrics)) : [],
    [records, selectedMetrics],
  );
  const locationCounts = useMemo(
    () => getMultiLocationFacetCounts(recordsWithSelectedMetricData, 'location'),
    [recordsWithSelectedMetricData],
  );
  const recordsInSelectedLocations = useMemo(() => {
    const selected = new Set(selectedLocations);
    return recordsWithSelectedMetricData.filter((record) => selected.has(record.location));
  }, [recordsWithSelectedMetricData, selectedLocations]);
  const entityCounts = useMemo(
    () => getMultiLocationFacetCounts(recordsInSelectedLocations, 'entity'),
    [recordsInSelectedLocations],
  );
  const recordsInSelectedEntities = useMemo(() => {
    const selected = new Set(selectedEntities);
    return recordsInSelectedLocations.filter((record) => selected.has(record.entity));
  }, [recordsInSelectedLocations, selectedEntities]);
  const observerCounts = useMemo(
    () => getMultiLocationFacetCounts(recordsInSelectedEntities, 'observer'),
    [recordsInSelectedEntities],
  );
  const effectiveLocations = useMemo(() => selectedLocations.filter((value) => (locationCounts.get(value) ?? 0) > 0), [selectedLocations, locationCounts]);
  const effectiveEntities = useMemo(() => selectedEntities.filter((value) => (entityCounts.get(value) ?? 0) > 0), [selectedEntities, entityCounts]);
  const effectiveObservers = useMemo(() => selectedObservers.filter((value) => (observerCounts.get(value) ?? 0) > 0), [selectedObservers, observerCounts]);
  const locationOptions = useMemo(() => availableLocations.map((value) => ({ value, count: locationCounts.get(value) ?? 0 })), [availableLocations, locationCounts]);
  const entityOptions = useMemo(() => availableEntities.map((value) => ({ value, count: entityCounts.get(value) ?? 0 })), [availableEntities, entityCounts]);
  const observerOptions = useMemo(() => availableObservers.map((value) => ({ value, count: observerCounts.get(value) ?? 0 })), [availableObservers, observerCounts]);

  const aggregation = useMemo(() => aggregateMultiLocation(
    records,
    { entities: effectiveEntities, locations: effectiveLocations, observers: effectiveObservers },
    selectedMetrics,
    onlyWithValues,
  ), [records, effectiveEntities, effectiveLocations, effectiveObservers, selectedMetrics, onlyWithValues]);
  const plotListing = useMemo(() => listMultiLocationRecords(
    records,
    { entities: effectiveEntities, locations: effectiveLocations, observers: effectiveObservers },
    selectedMetrics,
  ), [records, effectiveEntities, effectiveLocations, effectiveObservers, selectedMetrics]);
  const tableModel = tableMode === 'averages' ? aggregation : plotListing;
  const tableGenotypeCount = useMemo(
    () => new Set(tableModel.rows.map((row) => String(row['(GER) Name'] ?? '')).filter(Boolean)).size,
    [tableModel],
  );

  const activeColumnFilterCount = Object.values(columnFilters).filter((value) => value.trim()).length;
  const resultRows = useMemo(() => {
    const activeFilters = Object.entries(columnFilters).filter(([, value]) => value.trim());
    const filteredRows = activeFilters.length
      ? tableModel.rows.filter((row) => activeFilters.every(([header, filter]) => normalizeHeader(displayValue(row[header])).includes(normalizeHeader(filter))))
      : tableModel.rows;
    if (!sortConfig || !tableModel.headers.includes(sortConfig.header)) return filteredRows;
    return filteredRows.map((row, index) => ({ row, index })).sort((a, b) => {
      const aValue = a.row[sortConfig.header];
      const bValue = b.row[sortConfig.header];
      const aFilled = isMultiLocationFilled(aValue);
      const bFilled = isMultiLocationFilled(bValue);
      if (!aFilled && !bFilled) return a.index - b.index;
      if (!aFilled) return 1;
      if (!bFilled) return -1;
      const comparison = compareCellValues(aValue, bValue);
      return comparison === 0 ? a.index - b.index : sortConfig.direction === 'asc' ? comparison : -comparison;
    }).map(({ row }) => row);
  }, [tableModel, columnFilters, sortConfig]);

  const visibleMetricOptions = metricNames.filter((metric) => normalizeHeader(metric).includes(normalizeHeader(metricSearch)));

  function resetTableState() {
    setColumnFilters({});
    setSortConfig(null);
    setCopyStatus('idle');
  }

  async function loadFile(file: File) {
    setLoading(true);
    setError('');
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array', cellDates: true });
      const firstSheet = workbook.SheetNames[0];
      if (!firstSheet) throw new Error('A planilha não possui abas legíveis.');
      const matrix = XLSX.utils.sheet_to_json<MultiLocationCellValue[]>(workbook.Sheets[firstSheet], { header: 1, defval: '', raw: true });
      const parsed = parseMultiLocationMatrix(matrix);
      const counts = getNumericMetricCounts(parsed.records, parsed.metricNames);
      const populatedMetrics = parsed.metricNames.filter((metric) => (counts.get(metric) ?? 0) > 0);
      if (!populatedMetrics.length) throw new Error('Não encontrei valores numéricos nas variáveis depois de Block.');

      setFileName(file.name);
      setSheetName(firstSheet);
      setRecords(parsed.records);
      setMetricNames(parsed.metricNames);
      setSelectedEntities(getMultiLocationValues(parsed.records, 'entity'));
      setSelectedLocations(getMultiLocationValues(parsed.records, 'location'));
      setSelectedObservers(getMultiLocationValues(parsed.records, 'observer'));
      setSelectedMetrics(populatedMetrics);
      setTableMode('averages');
      setOnlyWithValues(true);
      setEntitySearch('');
      setLocationSearch('');
      setObserverSearch('');
      setMetricSearch('');
      resetTableState();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível ler esse arquivo.');
      setRecords([]);
      setMetricNames([]);
      setSelectedEntities([]);
      setSelectedLocations([]);
      setSelectedObservers([]);
      setSelectedMetrics([]);
      resetTableState();
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

  function restoreSelections() {
    setSelectedEntities(availableEntities);
    setSelectedLocations(availableLocations);
    setSelectedObservers(availableObservers);
    setSelectedMetrics(metricNames.filter((metric) => getNumericMetricCounts(records, metricNames).get(metric)));
    setOnlyWithValues(true);
    setEntitySearch('');
    setLocationSearch('');
    setObserverSearch('');
    setMetricSearch('');
    resetTableState();
  }

  function toggleMetric(metric: string) {
    setSelectedMetrics((current) => current.includes(metric) ? current.filter((item) => item !== metric) : [...current, metric]);
    resetTableState();
  }

  function toggleSort(header: string) {
    setSortConfig((current) => {
      if (!current || current.header !== header) return { header, direction: 'asc' };
      if (current.direction === 'asc') return { header, direction: 'desc' };
      return null;
    });
    setCopyStatus('idle');
  }

  function exportData(format: 'xlsx' | 'csv') {
    if (!resultRows.length) return;
    const sheet = XLSX.utils.json_to_sheet(resultRows, { header: tableModel.headers });
    const stem = safeFileStem(fileName) || 'phenome';
    const isAverageView = tableMode === 'averages';
    if (format === 'xlsx') {
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, isAverageView ? 'Médias multi-location' : 'Parcelas multi-location');
      XLSX.writeFile(workbook, `${stem}_${isAverageView ? 'medias' : 'parcelas'}_multi_location.xlsx`);
    } else {
      const csv = XLSX.utils.sheet_to_csv(sheet, { FS: ';' });
      const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${stem}_${isAverageView ? 'medias' : 'parcelas'}_multi_location.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    }
  }

  async function copyData() {
    if (!resultRows.length) return;
    const text = [
      tableModel.headers,
      ...resultRows.map((row) => tableModel.headers.map((header) => displayValue(row[header]))),
    ].map((row) => row.map((value) => value.replace(/\t/g, ' ').replace(/\r?\n/g, ' ')).join('\t')).join('\r\n');

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (!copied) throw new Error('O navegador não permitiu copiar os dados.');
      }
      setCopyStatus('copied');
      window.setTimeout(() => setCopyStatus('idle'), 2200);
    } catch {
      setCopyStatus('error');
      window.setTimeout(() => setCopyStatus('idle'), 3000);
    }
  }

  return (
    <>
      <section className="intro multi-location-intro">
        <div><span className="step-label">01 · Importar rede</span><h2>Compare locais pela média de cada genótipo.</h2><p>Filtre as variáveis em cascata e alterne entre a média consolidada e os dados parcela por parcela.</p></div>
        <div className={`dropzone ${dragging ? 'is-dragging' : ''} ${records.length ? 'has-file' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={handleDrop}>
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleInput} aria-label="Selecionar arquivo multi-location do Phenome" />
          <div className="file-icon" aria-hidden="true">XLS</div>
          <div className="drop-copy"><strong>{loading ? 'Lendo a planilha…' : records.length ? fileName : 'Arraste o arquivo multi-location'}</strong><span>{records.length ? `${records.length.toLocaleString('pt-BR')} registros · aba ${sheetName}` : 'ou selecione um arquivo .xlsx, .xls ou .csv'}</span>{records.length > 0 && <em className="file-type-badge">Extração detectada · Multi-location</em>}</div>
          <button className="button primary" type="button" onClick={() => inputRef.current?.click()} disabled={loading}>{records.length ? 'Trocar arquivo' : 'Selecionar arquivo'}</button>
        </div>
        {error && <p className="error-message" role="alert">{error}</p>}
      </section>

      {!records.length ? (
        <section className="empty-preview" aria-label="Como funciona o modo multi-location">
          <div className="preview-head"><span className="step-label">02 · Filtrar e calcular</span><span className="preview-pill">Block pode estar vazio</span></div>
          <div className="preview-grid">
            <article><span>1</span><h3>Importe</h3><p>As colunas estruturais são reconhecidas pelo cabeçalho, mesmo com variações de escrita.</p></article>
            <article><span>2</span><h3>Segmente</h3><p>Escolha os ensaios, locais e tomadores de nota que devem entrar no cálculo.</p></article>
            <article><span>3</span><h3>Visualize</h3><p>Alterne entre uma linha por germoplasma e o detalhamento de cada parcela.</p></article>
          </div>
        </section>
      ) : (
        <section className="workspace multi-location-workspace">
          <aside className="filters">
            <div className="section-heading"><span className="step-label">02 · Segmentar</span><button className="text-button" type="button" onClick={restoreSelections}>Restaurar</button></div>
            <p className="cascade-hint">Os filtros abaixo funcionam em cascata. Cada etapa considera as seleções anteriores.</p>
            <div className="filter-group cascade-step">
              <div className="filter-title"><label htmlFor="multi-metric-search"><span className="cascade-number">1</span>Variáveis</label><span>{selectedMetrics.filter((metric) => (metricCounts.get(metric) ?? 0) > 0).length}/{metricNames.filter((metric) => (metricCounts.get(metric) ?? 0) > 0).length}</span></div>
              <input id="multi-metric-search" className="search-input" value={metricSearch} onChange={(event) => setMetricSearch(event.target.value)} placeholder="Buscar variável…" />
              <div className="quick-actions">
                <button type="button" onClick={() => { setSelectedMetrics(metricNames.filter((metric) => (metricCounts.get(metric) ?? 0) > 0)); resetTableState(); }}>Todas</button>
                <button type="button" onClick={() => { setSelectedMetrics([]); resetTableState(); }}>Limpar</button>
                <span className="detected-values">{metricNames.filter((metric) => (metricCounts.get(metric) ?? 0) > 0).length} com dados</span>
              </div>
              <div className="metric-list">{visibleMetricOptions.map((metric) => (
                <label key={metric} className={`metric-option ${(metricCounts.get(metric) ?? 0) === 0 ? 'disabled' : ''}`}><input type="checkbox" checked={selectedMetrics.includes(metric) && (metricCounts.get(metric) ?? 0) > 0} onChange={() => toggleMetric(metric)} disabled={(metricCounts.get(metric) ?? 0) === 0} /><span className="custom-check" aria-hidden="true">✓</span><span className="metric-name">{metric}</span><span className={`count-badge ${(metricCounts.get(metric) ?? 0) > 0 ? 'has-count' : ''}`}>{(metricCounts.get(metric) ?? 0).toLocaleString('pt-BR')}</span></label>
              ))}</div>
            </div>
            <div className="cascade-step"><span className="cascade-number">2</span><SegmentFilter label="Location · Local" options={locationOptions} selected={selectedLocations} search={locationSearch} onSearch={setLocationSearch} onChange={setSelectedLocations} onResetTable={resetTableState} /></div>
            <div className="cascade-step"><span className="cascade-number">3</span><SegmentFilter label="Entity name · Ensaio" options={entityOptions} selected={selectedEntities} search={entitySearch} onSearch={setEntitySearch} onChange={setSelectedEntities} onResetTable={resetTableState} /></div>
            <div className="cascade-step"><span className="cascade-number">4</span><SegmentFilter label="(OBS) Name · Tomador da nota" options={observerOptions} selected={selectedObservers} search={observerSearch} onSearch={setObserverSearch} onChange={setSelectedObservers} onResetTable={resetTableState} /></div>
            {tableMode === 'averages' && <label className="toggle-row"><span><strong>Somente genótipos com média</strong><small>Oculta genótipos sem valor numérico nas variáveis escolhidas</small></span><input type="checkbox" checked={onlyWithValues} onChange={(event) => { setOnlyWithValues(event.target.checked); resetTableState(); }} /><span className="toggle" aria-hidden="true" /></label>}
          </aside>

          <div className="results">
            <div className="results-toolbar"><div><span className="step-label">03 · Visualizar e exportar</span><h2>{tableMode === 'averages' ? 'Médias por genótipo' : 'Dados parcela por parcela'}</h2></div><div className="results-view-controls"><div className="view-switch" aria-label="Modo de visualização"><button type="button" className={tableMode === 'averages' ? 'active' : ''} onClick={() => { setTableMode('averages'); resetTableState(); }}>Médias</button><button type="button" className={tableMode === 'plots' ? 'active' : ''} onClick={() => { setTableMode('plots'); resetTableState(); }}>Parcelas</button></div><span className="calculation-badge">{tableMode === 'averages' ? 'Média entre registros filtrados' : 'Uma linha por registro'}</span></div></div>
            <p className="view-description">{tableMode === 'averages' ? <><strong>Block não separa o resultado.</strong> Cada linha reúne todas as observações selecionadas do mesmo (GER) Name.</> : <><strong>Detalhamento original.</strong> Cada linha mostra local, ensaio, genótipo, tomador, parcela e Block quando houver.</>}</p>
            <div className="stats-row"><div><span>Registros filtrados</span><strong>{tableModel.filteredRecordCount.toLocaleString('pt-BR')}</strong></div><div><span>Genótipos</span><strong>{tableGenotypeCount.toLocaleString('pt-BR')}</strong></div><div><span>{tableMode === 'averages' ? 'Valores na média' : 'Valores exibidos'}</span><strong>{tableModel.numericValueCount.toLocaleString('pt-BR')}</strong></div></div>
            {selectedMetrics.length === 0 ? <div className="table-message"><strong>Escolha pelo menos uma variável.</strong><span>Use a primeira segmentação à esquerda para liberar os demais filtros.</span></div> : tableModel.rows.length === 0 ? <div className="table-message"><strong>Nenhum dado encontrado com esses filtros.</strong><span>Selecione outros locais, ensaios ou tomadores de nota.</span></div> : (
              <><div className="table-wrap"><table><thead><tr className="header-row">{tableModel.headers.map((header) => {
                const activeSort = sortConfig?.header === header ? sortConfig.direction : null;
                const sortLabel = activeSort === 'asc' ? 'Ordem crescente' : activeSort === 'desc' ? 'Ordem decrescente' : 'Ordenar esta coluna';
                return <th key={header} aria-sort={activeSort === 'asc' ? 'ascending' : activeSort === 'desc' ? 'descending' : 'none'}><div className="th-content"><span>{header}</span><button className={`sort-button ${activeSort ? 'active' : ''}`} type="button" onClick={() => toggleSort(header)} aria-label={`${sortLabel}: ${header}`}>{activeSort === 'asc' ? '↑' : activeSort === 'desc' ? '↓' : '↕'}</button></div></th>;
              })}</tr><tr className="filter-row">{tableModel.headers.map((header) => <th key={`filter-${header}`}><input className="column-filter" value={columnFilters[header] ?? ''} onChange={(event) => { setColumnFilters((current) => ({ ...current, [header]: event.target.value })); setCopyStatus('idle'); }} placeholder="Filtrar…" aria-label={`Filtrar coluna ${header}`} /></th>)}</tr></thead><tbody>{resultRows.length ? resultRows.map((row, rowIndex) => <tr key={rowIndex}>{tableModel.headers.map((header) => <td key={header} className={isMultiLocationFilled(row[header]) ? '' : 'empty-cell'}>{displayValue(row[header]) || '—'}</td>)}</tr>) : <tr><td className="no-filter-results" colSpan={tableModel.headers.length}>Nenhuma linha corresponde aos filtros das colunas.</td></tr>}</tbody></table></div>
              <div className="table-footer"><div className="table-summary"><span>{resultRows.length.toLocaleString('pt-BR')} {tableMode === 'averages' ? (resultRows.length === 1 ? 'genótipo' : 'genótipos') : (resultRows.length === 1 ? 'registro' : 'registros')}</span>{activeColumnFilterCount > 0 && <button className="text-button" type="button" onClick={() => { setColumnFilters({}); setCopyStatus('idle'); }}>Limpar {activeColumnFilterCount} {activeColumnFilterCount === 1 ? 'filtro' : 'filtros'}</button>}</div><div className="export-actions"><button className={`button secondary copy-button ${copyStatus}`} type="button" onClick={() => void copyData()} disabled={!resultRows.length}>{copyStatus === 'copied' ? 'Dados copiados!' : copyStatus === 'error' ? 'Não foi possível copiar' : 'Copiar dados'}</button><button className="button secondary" type="button" onClick={() => exportData('csv')}>Baixar CSV</button><button className="button primary" type="button" onClick={() => exportData('xlsx')}>Baixar Excel</button></div></div></>
            )}
          </div>
        </section>
      )}
    </>
  );
}
