export interface ExifData {
  Make?: string;
  Model?: string;
  ExposureTime?: number | string;
  FNumber?: number;
  ISO?: number;
  FocalLength?: number;
  LensModel?: string;
  DateTimeOriginal?: Date | string;
  Software?: string;
  ExifImageWidth?: number;
  ExifImageHeight?: number;
  latitude?: number;
  longitude?: number;
  [key: string]: any;
}

export interface ImageFile {
  file: File;
  allMetadata: Record<string, any>;
  isProcessing: boolean;
}

export interface RedFlag {
  type: string;
  description: string;
  nodeId?: string;
  severity: 'high' | 'medium' | 'low';
}

export interface PlanNode {
  nodeId: string;
  physicalOp: string;
  logicalOp: string;
  objectName?: string;
  objectFull?: string;
  estimateRows: number;
  estimateExecutions: number;
  subtreeCost: number;
  selfCost: number;
  costPercent: number;
  selfCostPercent: number;
  depth: number;
  children: PlanNode[];
  attributes: Record<string, string>;
  outputList?: string[];
  predicate?: string;
  ordered?: boolean;
  estimatedRowsRead?: number;
}

export interface PlanSummary {
  totalNodes: number;
  operations: { name: string; count: number }[];
  totalCost: number;
  statementText: string;
  missingIndexes: string[];
  redFlags: RedFlag[];
  executionPath: PlanNode[];
  planTree: PlanNode | null;
}

// --- Mock Data Generator ---
export type FieldType =
  | 'UUID'
  | 'FirstName'
  | 'LastName'
  | 'FullName'
  | 'Email'
  | 'Phone'
  | 'Address'
  | 'City'
  | 'Country'
  | 'ZipCode'
  | 'Date'
  | 'Number'
  | 'Boolean'
  | 'Company'
  | 'JobTitle'
  | 'Paragraph'
  | 'Sentence'
  | 'Word'
  | 'URL'
  | 'IPAddress'
  | 'Avatar'
  | 'Color'
  | 'ProductName'
  | 'Price'
  | 'Department'
  | 'ProductMaterial'
  | 'CreditCardNumber'
  | 'CreditCardCVV'
  | 'AccountNumber'
  | 'BitcoinAddress'
  | 'CurrencyCode'
  | 'Username'
  | 'Password'
  | 'IPv6'
  | 'MACAddress'
  | 'DomainName'
  | 'UserAgent'
  | 'State'
  | 'CountryCode'
  | 'Latitude'
  | 'Longitude'
  | 'Gender'
  | 'Prefix'
  | 'Suffix'
  | 'FileName'
  | 'MimeType'
  | 'Semver'
  | 'Vehicle'
  | 'Manufacturer'
  | 'Model'
  | 'VIN'
  | 'AnimalType'
  | 'Cat'
  | 'Dog'
  | 'Product'
  | 'ProductDescription'
  | 'ProductAdjective'
  | 'SKU'
  | 'CustomList';

export interface FieldOptions {
  min?: number;
  max?: number;
  from?: string;
  to?: string;
  customValues?: string;
  nullPercentage?: number;
  factor?: string;
  arrayCount?: number;
}

export interface MockField {
  id: string;
  name: string;
  type: FieldType;
  options?: FieldOptions;
}

export type OutputFormat = 'JSON' | 'CSV' | 'SQL';
