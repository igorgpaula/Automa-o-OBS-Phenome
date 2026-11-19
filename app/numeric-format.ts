import * as XLSX from 'xlsx';
import { HeatmapCellValue, HeatmapRow, toHeatmapNumber } from './heatmap';

const twoDecimalFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatNumericVariable(value: HeatmapCellValue) {
  const numericValue = toHeatmapNumber(value);
  return numericValue === null ? null : twoDecimalFormatter.format(numericValue);
}

export function applyTwoDecimalSheetFormat(
  sheet: XLSX.WorkSheet,
  rows: HeatmapRow[],
  headers: string[],
  numericHeaders: Iterable<string>,
) {
  const numericHeaderSet = new Set(numericHeaders);

  headers.forEach((header, columnIndex) => {
    if (!numericHeaderSet.has(header)) return;
    rows.forEach((row, rowIndex) => {
      const numericValue = toHeatmapNumber(row[header]);
      if (numericValue === null) return;
      const cellAddress = XLSX.utils.encode_cell({ r: rowIndex + 1, c: columnIndex });
      const cell = sheet[cellAddress];
      if (!cell) return;
      cell.t = 'n';
      cell.v = numericValue;
      cell.z = '0.00';
      delete cell.w;
    });
  });

  return sheet;
}
