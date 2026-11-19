import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { applyTwoDecimalSheetFormat, formatNumericVariable } from './numeric-format';

describe('numeric variable formatting', () => {
  it('exibe exatamente duas casas decimais em português', () => {
    expect(formatNumericVariable(4)).toBe('4,00');
    expect(formatNumericVariable('4,567')).toBe('4,57');
    expect(formatNumericVariable(4602.2417)).toBe('4.602,24');
    expect(formatNumericVariable('texto')).toBeNull();
    expect(formatNumericVariable('')).toBeNull();
  });

  it('mantém identificadores intactos e aplica 0.00 somente às variáveis no Excel', () => {
    const rows = [{ 'Entry code': 7, VIG: 4, ALT: '81,257' }];
    const headers = ['Entry code', 'VIG', 'ALT'];
    const sheet = XLSX.utils.json_to_sheet(rows, { header: headers });
    applyTwoDecimalSheetFormat(sheet, rows, headers, ['VIG', 'ALT']);

    expect(sheet.A2.z).toBeUndefined();
    expect(sheet.B2).toMatchObject({ t: 'n', v: 4, z: '0.00' });
    expect(sheet.C2).toMatchObject({ t: 'n', v: 81.257, z: '0.00' });
    expect(XLSX.utils.sheet_to_csv(sheet, { FS: ';' }).trim()).toContain('7;4.00;81.26');
  });
});
