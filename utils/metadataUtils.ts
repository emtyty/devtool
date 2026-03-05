const TAG_GROUPS = ['EXIF', 'IFD0', 'XMP', 'MakerNotes', 'File', 'Composite', 'IPTC'];

export const getTag = (metadata: Record<string, any>, key: string): any => {
  if (metadata[key] !== undefined) return metadata[key];

  for (const group of TAG_GROUPS) {
    if (metadata[`${group}:${key}`] !== undefined) return metadata[`${group}:${key}`];
  }

  for (const fullKey in metadata) {
    if (fullKey.endsWith(`:${key}`)) return metadata[fullKey];
  }

  return undefined;
};

export const formatExposure = (val: any): string => {
  if (typeof val === 'number' && val > 0 && val < 1) return `1/${Math.round(1 / val)}s`;
  return val ? `${val}s` : '--';
};
