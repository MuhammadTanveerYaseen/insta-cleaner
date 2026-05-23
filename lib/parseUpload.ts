/**
 * Parse an uploaded CSV / XLSX / JSON file into a list of row objects.
 *
 * Runs on the Node.js server side. Returns `RawRow[]` for `processRows()`.
 */

import Papa from 'papaparse';
import * as XLSX from 'xlsx';

import type { RawRow } from './processor';

export async function parseUpload(file: File): Promise<RawRow[]> {
  const name = (file.name ?? '').toLowerCase();
  const ext = name.includes('.') ? name.split('.').pop()! : '';
  const buffer = Buffer.from(await file.arrayBuffer());

  if (ext === 'xlsx' || ext === 'xls') {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const firstSheet = wb.SheetNames[0];
    if (!firstSheet) return [];
    const sheet = wb.Sheets[firstSheet];
    const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: '', raw: false });
    return rows;
  }

  if (ext === 'json') {
    const text = buffer.toString('utf-8').replace(/^\uFEFF/, '');
    let data: unknown = JSON.parse(text);
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const obj = data as Record<string, unknown>;
      for (const key of ['data', 'results', 'items', 'users', 'rows']) {
        if (Array.isArray(obj[key])) { data = obj[key]; break; }
      }
      if (!Array.isArray(data)) data = [obj];
    }
    if (!Array.isArray(data)) return [];
    return data.map(row => (row && typeof row === 'object' ? (row as RawRow) : { value: row }));
  }

  // Default: CSV. Use auto delimiter sniffing.
  const text = buffer.toString('utf-8').replace(/^\uFEFF/, '');
  const parsed = Papa.parse<RawRow>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });
  return (parsed.data ?? []).filter(r => r && typeof r === 'object');
}
