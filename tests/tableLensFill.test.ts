import { describe, it, expect } from 'vitest';
import { buildFillValues, canFillSeries, fillValueAt, isDayFirstLocale, resolveFillMode } from '../utils/tableLensFill';

const series = (value: string, count = 3, dayFirst = false) => buildFillValues(value, count, 1, 'series', { dayFirst });
const seriesUp = (value: string, count = 3) => buildFillValues(value, count, -1, 'series');

describe('text with numbers', () => {
  it('increments a trailing number', () => {
    expect(series('Item 1')).toEqual(['Item 2', 'Item 3', 'Item 4']);
  });

  it('keeps zero padding for codes', () => {
    expect(series('A0001')).toEqual(['A0002', 'A0003', 'A0004']);
    expect(series('A0998')).toEqual(['A0999', 'A1000', 'A1001']);
    expect(series('INV-00009', 2)).toEqual(['INV-00010', 'INV-00011']);
  });

  it('grows past the padding width', () => {
    expect(series('A9999', 2)).toEqual(['A10000', 'A10001']);
  });

  it('does not pad numbers that had no leading zero', () => {
    expect(seriesUp('Item 10', 2)).toEqual(['Item 9', 'Item 8']);
  });

  it('steps the last number when text follows it', () => {
    expect(series('Room 5A', 2)).toEqual(['Room 6A', 'Room 7A']);
    expect(series('v1.9', 2)).toEqual(['v1.10', 'v1.11']);
  });

  it('fixes ordinal suffixes', () => {
    expect(series('1st', 4)).toEqual(['2nd', '3rd', '4th', '5th']);
    expect(series('10th', 3)).toEqual(['11th', '12th', '13th']);
    expect(series('21ST', 1)).toEqual(['22ND']);
  });

  it('mirrors past zero when filling upward', () => {
    expect(seriesUp('Item 1', 3)).toEqual(['Item 0', 'Item 1', 'Item 2']);
  });

  it('handles numbers too long for floating point', () => {
    expect(series('ID20240131000000001', 1)).toEqual(['ID20240131000000002']);
  });
});

describe('plain numbers', () => {
  it('counts up and down', () => {
    expect(series('5')).toEqual(['6', '7', '8']);
    expect(seriesUp('2')).toEqual(['1', '0', '-1']);
  });

  it('keeps decimal places', () => {
    expect(series('1.50', 2)).toEqual(['2.50', '3.50']);
  });
});

describe('dates', () => {
  it('steps ISO dates across month and leap-year boundaries', () => {
    expect(series('2024-01-31', 2)).toEqual(['2024-02-01', '2024-02-02']);
    expect(series('2024-02-28', 2)).toEqual(['2024-02-29', '2024-03-01']);
    expect(seriesUp('2024-01-01', 1)).toEqual(['2023-12-31']);
  });

  it('keeps the time part of ISO date-times', () => {
    expect(series('2024-01-31T09:30:00Z', 1)).toEqual(['2024-02-01T09:30:00Z']);
    expect(series('2024-01-31 09:30', 1)).toEqual(['2024-02-01 09:30']);
  });

  it('steps year-month values by month', () => {
    expect(series('2024-11', 3)).toEqual(['2024-12', '2025-01', '2025-02']);
  });

  it('reads slash dates month-first by default', () => {
    expect(series('1/31/2024', 2)).toEqual(['2/1/2024', '2/2/2024']);
    expect(series('03/04/2024', 1)).toEqual(['03/05/2024']);
  });

  it('reads ambiguous slash dates day-first for day-first locales', () => {
    expect(series('03/04/2024', 1, true)).toEqual(['04/04/2024']);
  });

  it('treats a part above 12 as the day regardless of locale', () => {
    expect(series('31/01/2024', 1)).toEqual(['01/02/2024']);
    expect(series('1/31/2024', 1, true)).toEqual(['2/1/2024']);
  });

  it('reads dotted dates day-first', () => {
    expect(series('31.12.2024', 2)).toEqual(['01.01.2025', '02.01.2025']);
  });

  it('falls back to text rules for impossible dates', () => {
    expect(series('2024-02-30', 1)).toEqual(['2024-02-31']);
  });
});

describe('cyclic lists', () => {
  it('cycles weekdays and keeps short/long form', () => {
    expect(series('Fri', 3)).toEqual(['Sat', 'Sun', 'Mon']);
    expect(series('Saturday', 2)).toEqual(['Sunday', 'Monday']);
  });

  it('cycles months and keeps casing', () => {
    expect(series('Nov', 3)).toEqual(['Dec', 'Jan', 'Feb']);
    expect(series('DECEMBER', 1)).toEqual(['JANUARY']);
    expect(series('jan', 1)).toEqual(['feb']);
  });

  it('cycles quarters', () => {
    expect(series('Q3', 3)).toEqual(['Q4', 'Q1', 'Q2']);
    expect(series('Quarter 4', 1)).toEqual(['Quarter 1']);
    expect(seriesUp('Q1', 1)).toEqual(['Q4']);
  });
});

describe('copy and mode selection', () => {
  it('copies in copy mode', () => {
    expect(buildFillValues('Item 1', 2, 1, 'copy')).toEqual(['Item 1', 'Item 1']);
  });

  it('copies text without a pattern even in series mode', () => {
    expect(series('hello', 2)).toEqual(['hello', 'hello']);
    expect(canFillSeries('hello')).toBe(false);
    expect(canFillSeries('')).toBe(false);
  });

  it('copies plain numbers by default, like Excel', () => {
    expect(resolveFillMode('5', false)).toBe('copy');
    expect(resolveFillMode('5', true)).toBe('series');
  });

  it('continues patterned text by default', () => {
    expect(resolveFillMode('A0001', false)).toBe('series');
    expect(resolveFillMode('A0001', true)).toBe('copy');
    expect(resolveFillMode('2024-01-31', false)).toBe('series');
  });

  it('always copies values without a pattern', () => {
    expect(resolveFillMode('hello', true)).toBe('copy');
  });

  it('computes a single value at an offset', () => {
    expect(fillValueAt('A0001', 9, 'series')).toBe('A0010');
    expect(fillValueAt('A0001', 9, 'copy')).toBe('A0001');
  });
});

describe('isDayFirstLocale', () => {
  it('detects day-first and month-first locales', () => {
    expect(isDayFirstLocale('en-US')).toBe(false);
    expect(isDayFirstLocale('en-GB')).toBe(true);
    expect(isDayFirstLocale('da-DK')).toBe(true);
  });
});
