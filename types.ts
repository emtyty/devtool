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
}

export interface PlanSummary {
  totalNodes: number;
  operations: { name: string; count: number }[];
  totalCost: number;
  statementText: string;
  missingIndexes: string[];
  redFlags: RedFlag[];
}
