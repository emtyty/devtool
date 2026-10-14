import { describe, it, expect } from 'vitest';
import { read, utils, write } from 'xlsx';
import { getSaveFormat, getSaveWarning, serializeTable } from '../utils/tableLensSave';

const blobText = (blob: Blob) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsText(blob);
  });

const blobBuffer = (blob: Blob) =>
  new Promise<ArrayBuffer>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(blob);
  });

const columns = ['id', 'name', 'note'];
const rows = [
  { id: '1', name: 'Alice', note: 'plain' },
  { id: '007', name: 'Bob, Jr.', note: 'line 1\nline 2' },
];

describe('getSaveFormat', () => {
  it('maps extensions to formats', () => {
    expect(getSaveFormat('data.csv')).toBe('csv');
    expect(getSaveFormat('data.TSV')).toBe('tsv');
    expect(getSaveFormat('data.tab')).toBe('tsv');
    expect(getSaveFormat('data.json')).toBe('json');
    expect(getSaveFormat('book.xlsx')).toBe('xlsx');
    expect(getSaveFormat('old.xls')).toBe('xls');
    expect(getSaveFormat('noext')).toBe('csv');
  });
});

describe('getSaveWarning', () => {
  it('warns only for formats that do not round-trip exactly', () => {
    expect(getSaveWarning('csv')).toBeNull();
    expect(getSaveWarning('tsv')).toBeNull();
    expect(getSaveWarning('json')).toMatch(/string/);
    expect(getSaveWarning('xlsx')).toMatch(/formatting/);
  });
});

describe('serializeTable', () => {
  it('writes CSV with quoting only where needed', async () => {
    const text = await blobText(await serializeTable(columns, rows, 'csv'));
    expect(text).toBe('id,name,note\r\n1,Alice,plain\r\n007,"Bob, Jr.","line 1\nline 2"');
  });

  it('keeps the original delimiter', async () => {
    const text = await blobText(await serializeTable(columns, rows.slice(0, 1), 'csv', { delimiter: ';' }));
    expect(text).toBe('id;name;note\r\n1;Alice;plain');
  });

  it('writes TSV', async () => {
    const text = await blobText(await serializeTable(['a', 'b'], [{ a: '1', b: '2' }], 'tsv'));
    expect(text).toBe('a\tb\r\n1\t2');
  });

  it('writes columns in the given order and fills missing cells', async () => {
    const text = await blobText(await serializeTable(['b', 'a'], [{ a: '1' }], 'csv'));
    expect(text).toBe('b,a\r\n,1');
  });

  it('writes JSON as an array of objects', async () => {
    const text = await blobText(await serializeTable(['id', 'name'], rows, 'json'));
    expect(JSON.parse(text)).toEqual([
      { id: '1', name: 'Alice' },
      { id: '007', name: 'Bob, Jr.' },
    ]);
  });

  it('writes XLSX with numbers as numbers and codes as text', async () => {
    const buffer = await blobBuffer(await serializeTable(columns, rows, 'xlsx'));
    const wb = read(buffer, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    expect(sheet.A2.v).toBe(1);
    expect(sheet.A3.v).toBe('007');
    expect(utils.sheet_to_json(sheet)).toHaveLength(2);
  });

  it('replaces only the loaded sheet and keeps the others', async () => {
    const original = utils.book_new();
    utils.book_append_sheet(original, utils.aoa_to_sheet([['old']]), 'Data');
    utils.book_append_sheet(original, utils.aoa_to_sheet([['keep me']]), 'Notes');
    const workbook = write(original, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;

    const buffer = await blobBuffer(
      await serializeTable(['id'], [{ id: 'new' }], 'xlsx', { workbook, sheetName: 'Data' })
    );
    const wb = read(buffer, { type: 'array' });
    expect(wb.SheetNames).toEqual(['Data', 'Notes']);
    expect(wb.Sheets.Data.A2.v).toBe('new');
    expect(wb.Sheets.Notes.A1.v).toBe('keep me');
  });
});
