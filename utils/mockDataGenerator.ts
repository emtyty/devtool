import { faker } from '@faker-js/faker';
import { MockField, FieldType } from '../types';

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

export const generateValue = (field: MockField): any => {
  switch (field.type) {
    case 'UUID': return faker.string.uuid();
    case 'FirstName': return faker.person.firstName();
    case 'LastName': return faker.person.lastName();
    case 'FullName': return faker.person.fullName();
    case 'Email': return faker.internet.email();
    case 'Phone': return faker.phone.number();
    case 'Address': return faker.location.streetAddress();
    case 'City': return faker.location.city();
    case 'Country': return faker.location.country();
    case 'ZipCode': return faker.location.zipCode();
    case 'Date': {
      const from = field.options?.from ? new Date(field.options.from) : faker.date.past({ years: 10 });
      const to = field.options?.to ? new Date(field.options.to) : faker.date.future({ years: 10 });
      if (from.getTime() > to.getTime()) {
        return faker.date.between({ from: to, to: from }).toISOString();
      }
      return faker.date.between({ from, to }).toISOString();
    }
    case 'Number': {
      const min = field.options?.min ?? 1;
      const max = field.options?.max ?? 1000;
      const actualMin = Math.min(min, max);
      const actualMax = Math.max(min, max);
      const factors = parseFactors(field.options?.factor);
      return getWeightedValue(factors, () => faker.number.int({ min: actualMin, max: actualMax }));
    }
    case 'Boolean': return faker.datatype.boolean();
    case 'Company': return faker.company.name();
    case 'JobTitle': return faker.person.jobTitle();
    case 'Paragraph': return faker.lorem.paragraph();
    case 'Sentence': return faker.lorem.sentence();
    case 'Word': return faker.lorem.word();
    case 'URL': return faker.internet.url();
    case 'IPAddress': return faker.internet.ipv4();
    case 'Avatar': return faker.image.avatar();
    case 'Color': return faker.color.human();
    case 'Product': return faker.commerce.product();
    case 'ProductName': return faker.commerce.productName();
    case 'ProductDescription': return faker.commerce.productDescription();
    case 'ProductAdjective': return faker.commerce.productAdjective();
    case 'SKU': return faker.string.alphanumeric({ length: 8, casing: 'upper' }) + '-' + faker.string.alphanumeric({ length: 4, casing: 'upper' });
    case 'Price': return faker.commerce.price();
    case 'Department': return faker.commerce.department();
    case 'ProductMaterial': return faker.commerce.productMaterial();
    case 'CreditCardNumber': return faker.finance.creditCardNumber();
    case 'CreditCardCVV': return faker.finance.creditCardCVV();
    case 'AccountNumber': return faker.finance.accountNumber();
    case 'BitcoinAddress': return faker.finance.bitcoinAddress();
    case 'CurrencyCode': return faker.finance.currencyCode();
    case 'Username': return faker.internet.username();
    case 'Password': return faker.internet.password();
    case 'IPv6': return faker.internet.ipv6();
    case 'MACAddress': return faker.internet.mac();
    case 'DomainName': return faker.internet.domainName();
    case 'UserAgent': return faker.internet.userAgent();
    case 'State': return faker.location.state();
    case 'CountryCode': return faker.location.countryCode();
    case 'Latitude': return faker.location.latitude().toString();
    case 'Longitude': return faker.location.longitude().toString();
    case 'Gender': return faker.person.gender();
    case 'Prefix': return faker.person.prefix();
    case 'Suffix': return faker.person.suffix();
    case 'FileName': return faker.system.fileName();
    case 'MimeType': return faker.system.mimeType();
    case 'Semver': return faker.system.semver();
    case 'Vehicle': return faker.vehicle.vehicle();
    case 'Manufacturer': return faker.vehicle.manufacturer();
    case 'Model': return faker.vehicle.model();
    case 'VIN': return faker.vehicle.vin();
    case 'AnimalType': return faker.animal.type();
    case 'Cat': return faker.animal.cat();
    case 'Dog': return faker.animal.dog();
    case 'CustomList': {
      const vals = field.options?.customValues?.split(',').map(v => v.trim()).filter(v => v);
      if (!vals || vals.length === 0) return 'Sample';
      const factors = parseFactors(field.options?.factor);
      return getWeightedValue(factors, () => faker.helpers.arrayElement(vals));
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
      let key = keys[i];
      const isArray = key.endsWith('[0]');
      if (isArray) key = key.slice(0, -3);

      if (i === keys.length - 1) {
        if (isArray) {
          current[key] = [data[p]];
        } else {
          current[key] = data[p];
        }
      } else {
        if (isArray) {
          current[key] = current[key] || [{}];
          current = current[key][0];
        } else {
          current[key] = current[key] || {};
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
  tableName: string = 'mock_data'
): string => {
  const data: Record<string, any>[] = [];

  // Pre-calculate exact null indices for each field
  const fieldNullIndices: Record<string, Set<number>> = {};
  fields.forEach(field => {
    if (field.options?.nullPercentage !== undefined && field.options.nullPercentage > 0) {
      const numNulls = Math.round((field.options.nullPercentage / 100) * rows);
      const indices = new Set<number>();
      const allIndices = Array.from({ length: rows }, (_, i) => i);
      const shuffled = faker.helpers.shuffle(allIndices);
      for (let i = 0; i < numNulls; i++) indices.add(shuffled[i]);
      fieldNullIndices[field.id] = indices;
    }
  });

  for (let i = 0; i < rows; i++) {
    const row: Record<string, any> = {};
    fields.forEach(field => {
      row[field.name] = fieldNullIndices[field.id]?.has(i) ? '' : generateValue(field);
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
