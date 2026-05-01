import {
  faker,
  fakerEN,
  fakerJA,
  fakerVI,
  fakerDA,
  fakerDE,
  fakerFR,
  type Faker,
} from '@faker-js/faker';
import { MockField, FieldType } from '../types';
import { getLocaleOverride } from './mockDataLocaleOverrides';

export type MockLocale = 'en' | 'ja' | 'vi' | 'da' | 'de' | 'fr';

export const LOCALE_OPTIONS: { value: MockLocale; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語 (Japanese)' },
  { value: 'vi', label: 'Tiếng Việt (Vietnamese)' },
  { value: 'da', label: 'Dansk (Danish)' },
  { value: 'de', label: 'Deutsch (German)' },
  { value: 'fr', label: 'Français (French)' },
];

const FAKER_BY_LOCALE: Record<MockLocale, Faker> = {
  en: fakerEN,
  ja: fakerJA,
  vi: fakerVI,
  da: fakerDA,
  de: fakerDE,
  fr: fakerFR,
};

export function getFakerForLocale(locale: MockLocale): Faker {
  return FAKER_BY_LOCALE[locale] ?? fakerEN;
}

export const FIELD_TYPES: { label: string; value: FieldType; category: string }[] = [
  { label: 'UUID', value: 'UUID', category: 'Basic' },
  { label: 'Number', value: 'Number', category: 'Basic' },
  { label: 'Boolean', value: 'Boolean', category: 'Basic' },
  { label: 'First Name', value: 'FirstName', category: 'Personal' },
  { label: 'Last Name', value: 'LastName', category: 'Personal' },
  { label: 'Full Name', value: 'FullName', category: 'Personal' },
  { label: 'Email', value: 'Email', category: 'Personal' },
  { label: 'Phone', value: 'Phone', category: 'Personal' },
  { label: 'Job Title', value: 'JobTitle', category: 'Personal' },
  { label: 'Gender', value: 'Gender', category: 'Personal' },
  { label: 'Name Prefix', value: 'Prefix', category: 'Personal' },
  { label: 'Name Suffix', value: 'Suffix', category: 'Personal' },
  { label: 'Address', value: 'Address', category: 'Location' },
  { label: 'City', value: 'City', category: 'Location' },
  { label: 'Country', value: 'Country', category: 'Location' },
  { label: 'Zip Code', value: 'ZipCode', category: 'Location' },
  { label: 'State', value: 'State', category: 'Location' },
  { label: 'Country Code', value: 'CountryCode', category: 'Location' },
  { label: 'Latitude', value: 'Latitude', category: 'Location' },
  { label: 'Longitude', value: 'Longitude', category: 'Location' },
  { label: 'Date', value: 'Date', category: 'Date & Time' },
  { label: 'Company', value: 'Company', category: 'Business' },
  { label: 'Product', value: 'Product', category: 'Commerce' },
  { label: 'Product Name', value: 'ProductName', category: 'Commerce' },
  { label: 'Product Description', value: 'ProductDescription', category: 'Commerce' },
  { label: 'Product Adjective', value: 'ProductAdjective', category: 'Commerce' },
  { label: 'SKU', value: 'SKU', category: 'Commerce' },
  { label: 'Price', value: 'Price', category: 'Commerce' },
  { label: 'Department', value: 'Department', category: 'Commerce' },
  { label: 'Product Material', value: 'ProductMaterial', category: 'Commerce' },
  { label: 'Credit Card Number', value: 'CreditCardNumber', category: 'Finance' },
  { label: 'Credit Card CVV', value: 'CreditCardCVV', category: 'Finance' },
  { label: 'Account Number', value: 'AccountNumber', category: 'Finance' },
  { label: 'Bitcoin Address', value: 'BitcoinAddress', category: 'Finance' },
  { label: 'Currency Code', value: 'CurrencyCode', category: 'Finance' },
  { label: 'URL', value: 'URL', category: 'Internet' },
  { label: 'IP Address', value: 'IPAddress', category: 'Internet' },
  { label: 'IPv6 Address', value: 'IPv6', category: 'Internet' },
  { label: 'MAC Address', value: 'MACAddress', category: 'Internet' },
  { label: 'Domain Name', value: 'DomainName', category: 'Internet' },
  { label: 'Username', value: 'Username', category: 'Internet' },
  { label: 'Password', value: 'Password', category: 'Internet' },
  { label: 'User Agent', value: 'UserAgent', category: 'Internet' },
  { label: 'Avatar', value: 'Avatar', category: 'Internet' },
  { label: 'Paragraph', value: 'Paragraph', category: 'Text' },
  { label: 'Sentence', value: 'Sentence', category: 'Text' },
  { label: 'Word', value: 'Word', category: 'Text' },
  { label: 'Color', value: 'Color', category: 'Other' },
  { label: 'File Name', value: 'FileName', category: 'System' },
  { label: 'MIME Type', value: 'MimeType', category: 'System' },
  { label: 'Semver', value: 'Semver', category: 'System' },
  { label: 'Vehicle', value: 'Vehicle', category: 'Vehicle' },
  { label: 'Manufacturer', value: 'Manufacturer', category: 'Vehicle' },
  { label: 'Model', value: 'Model', category: 'Vehicle' },
  { label: 'VIN', value: 'VIN', category: 'Vehicle' },
  { label: 'Animal Type', value: 'AnimalType', category: 'Animal' },
  { label: 'Cat', value: 'Cat', category: 'Animal' },
  { label: 'Dog', value: 'Dog', category: 'Animal' },
  { label: 'Custom List', value: 'CustomList', category: 'Custom' },
];

const parseFactors = (factorString?: string): { value: string; weight: number }[] => {
  if (!factorString) return [];
  const parts = factorString.split(',').map(p => p.trim()).filter(p => p);
  const factors: { value: string; weight: number }[] = [];
  for (const part of parts) {
    const [val, weightStr] = part.split('=').map(s => s.trim());
    const weight = parseInt(weightStr, 10);
    if (val && !isNaN(weight)) {
      factors.push({ value: val, weight });
    }
  }
  return factors;
};

const getWeightedValue = (factors: { value: string; weight: number }[], fallbackGenerator: () => any): any => {
  if (factors.length === 0) return fallbackGenerator();

  const totalSpecifiedWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  const maxRandom = Math.max(100, totalSpecifiedWeight);
  const random = Math.random() * maxRandom;

  let cumulative = 0;
  for (const factor of factors) {
    cumulative += factor.weight;
    if (random < cumulative) {
      const numVal = Number(factor.value);
      return !isNaN(numVal) && factor.value.trim() !== '' ? numVal : factor.value;
    }
  }

  return fallbackGenerator();
};

export const generateValue = (field: MockField, fk: Faker = faker, locale: MockLocale = 'en'): any => {
  // Locale overrides for fields where faker silently falls back to English
  // (e.g. Department, ProductMaterial in vi/ja). Skip overrides for CustomList
  // — user-provided values should always win.
  if (field.type !== 'CustomList') {
    const override = getLocaleOverride(locale, field.type, fk);
    if (override !== null) return override;
  }

  switch (field.type) {
    case 'UUID': return fk.string.uuid();
    case 'FirstName': return fk.person.firstName();
    case 'LastName': return fk.person.lastName();
    case 'FullName': return fk.person.fullName();
    case 'Email': return fk.internet.email();
    case 'Phone': return fk.phone.number();
    case 'Address': return fk.location.streetAddress();
    case 'City': return fk.location.city();
    case 'Country': return fk.location.country();
    case 'ZipCode': return fk.location.zipCode();
    case 'Date': {
      const from = field.options?.from ? new Date(field.options.from) : fk.date.past({ years: 10 });
      const to = field.options?.to ? new Date(field.options.to) : fk.date.future({ years: 10 });
      if (from.getTime() > to.getTime()) {
        return fk.date.between({ from: to, to: from }).toISOString();
      }
      return fk.date.between({ from, to }).toISOString();
    }
    case 'Number': {
      const min = field.options?.min ?? 1;
      const max = field.options?.max ?? 1000;
      const actualMin = Math.min(min, max);
      const actualMax = Math.max(min, max);
      const factors = parseFactors(field.options?.factor);
      return getWeightedValue(factors, () => fk.number.int({ min: actualMin, max: actualMax }));
    }
    case 'Boolean': return fk.datatype.boolean();
    case 'Company': return fk.company.name();
    case 'JobTitle': return fk.person.jobTitle();
    case 'Paragraph': return fk.lorem.paragraph();
    case 'Sentence': return fk.lorem.sentence();
    case 'Word': return fk.lorem.word();
    case 'URL': return fk.internet.url();
    case 'IPAddress': return fk.internet.ipv4();
    case 'Avatar': return fk.image.avatar();
    case 'Color': return fk.color.human();
    case 'Product': return fk.commerce.product();
    case 'ProductName': return fk.commerce.productName();
    case 'ProductDescription': return fk.commerce.productDescription();
    case 'ProductAdjective': return fk.commerce.productAdjective();
    case 'SKU': return fk.string.alphanumeric({ length: 8, casing: 'upper' }) + '-' + fk.string.alphanumeric({ length: 4, casing: 'upper' });
    case 'Price': return fk.commerce.price();
    case 'Department': return fk.commerce.department();
    case 'ProductMaterial': return fk.commerce.productMaterial();
    case 'CreditCardNumber': return fk.finance.creditCardNumber();
    case 'CreditCardCVV': return fk.finance.creditCardCVV();
    case 'AccountNumber': return fk.finance.accountNumber();
    case 'BitcoinAddress': return fk.finance.bitcoinAddress();
    case 'CurrencyCode': return fk.finance.currencyCode();
    case 'Username': return fk.internet.username();
    case 'Password': return fk.internet.password();
    case 'IPv6': return fk.internet.ipv6();
    case 'MACAddress': return fk.internet.mac();
    case 'DomainName': return fk.internet.domainName();
    case 'UserAgent': return fk.internet.userAgent();
    case 'State': return fk.location.state();
    case 'CountryCode': return fk.location.countryCode();
    case 'Latitude': return fk.location.latitude().toString();
    case 'Longitude': return fk.location.longitude().toString();
    case 'Gender': return fk.person.gender();
    case 'Prefix': return fk.person.prefix();
    case 'Suffix': return fk.person.suffix();
    case 'FileName': return fk.system.fileName();
    case 'MimeType': return fk.system.mimeType();
    case 'Semver': return fk.system.semver();
    case 'Vehicle': return fk.vehicle.vehicle();
    case 'Manufacturer': return fk.vehicle.manufacturer();
    case 'Model': return fk.vehicle.model();
    case 'VIN': return fk.vehicle.vin();
    case 'AnimalType': return fk.animal.type();
    case 'Cat': return fk.animal.cat();
    case 'Dog': return fk.animal.dog();
    case 'CustomList': {
      const vals = field.options?.customValues?.split(',').map(v => v.trim()).filter(v => v);
      if (!vals || vals.length === 0) return 'Sample';
      const factors = parseFactors(field.options?.factor);
      return getWeightedValue(factors, () => fk.helpers.arrayElement(vals));
    }
    default: return '';
  }
};

const unflattenObject = (data: Record<string, any>): Record<string, any> => {
  if (Object(data) !== data || Array.isArray(data)) return data;
  const result: Record<string, any> = {};
  for (const p in data) {
    let current = result;
    const keys = p.split('.');
    for (let i = 0; i < keys.length; i++) {
      const rawKey = keys[i];
      const arrMatch = rawKey.match(/^(.+)\[(\d+)\]$/);
      const key = arrMatch ? arrMatch[1] : rawKey;
      const idx = arrMatch ? parseInt(arrMatch[2], 10) : -1;
      const isArr = arrMatch !== null;

      if (i === keys.length - 1) {
        if (isArr) {
          if (!Array.isArray(current[key])) current[key] = [];
          current[key][idx] = data[p];
        } else {
          current[key] = data[p];
        }
      } else {
        if (isArr) {
          if (!Array.isArray(current[key])) current[key] = [];
          if (current[key][idx] === undefined) current[key][idx] = {};
          current = current[key][idx];
        } else {
          if (!current[key] || typeof current[key] !== 'object' || Array.isArray(current[key])) {
            current[key] = {};
          }
          current = current[key];
        }
      }
    }
  }
  return result;
};

export const generateData = (
  fields: MockField[],
  rows: number,
  format: 'JSON' | 'CSV' | 'SQL',
  tableName: string = 'mock_data',
  locale: MockLocale = 'en'
): string => {
  const fk = getFakerForLocale(locale);
  const data: Record<string, any>[] = [];

  // Pre-calculate exact null indices for each field
  const fieldNullIndices: Record<string, Set<number>> = {};
  fields.forEach(field => {
    if (field.options?.nullPercentage !== undefined && field.options.nullPercentage > 0) {
      const numNulls = Math.round((field.options.nullPercentage / 100) * rows);
      const indices = new Set<number>();
      const allIndices = Array.from({ length: rows }, (_, i) => i);
      const shuffled = fk.helpers.shuffle(allIndices);
      for (let i = 0; i < numNulls; i++) indices.add(shuffled[i]);
      fieldNullIndices[field.id] = indices;
    }
  });

  for (let i = 0; i < rows; i++) {
    const row: Record<string, any> = {};
    fields.forEach(field => {
      if (fieldNullIndices[field.id]?.has(i)) {
        row[field.name] = '';
      } else if (field.options?.arrayCount) {
        row[field.name] = Array.from({ length: field.options.arrayCount }, () => generateValue(field, fk, locale));
      } else {
        row[field.name] = generateValue(field, fk, locale);
      }
    });
    data.push(row);
  }

  if (format === 'JSON') {
    return JSON.stringify(data.map(unflattenObject), null, 2);
  }

  if (format === 'CSV') {
    if (data.length === 0) return '';
    const headers = fields.map(f => f.name).join(',');
    const csvRows = data.map(row =>
      fields.map(f => {
        const val = row[f.name];
        if (val === null || val === '') return '';
        if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      }).join(',')
    );
    return [headers, ...csvRows].join('\n');
  }

  if (format === 'SQL') {
    if (data.length === 0) return '';
    const columns = fields.map(f => f.name).join(', ');
    return data.map(row => {
      const values = fields.map(f => {
        const val = row[f.name];
        if (val === null || val === '') return 'NULL';
        if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
        return val;
      }).join(', ');
      return `INSERT INTO ${tableName} (${columns}) VALUES (${values});`;
    }).join('\n');
  }

  return '';
};
