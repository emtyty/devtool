import { parseMetadata } from '@uswriting/exiftool';

// @ts-expect-error - Vite specific asset import
import zeroperlWasmUrl from '@6over3/zeroperl-ts/zeroperl.wasm?url';

export { zeroperlWasmUrl };

export const extractMetadata = async (file: File): Promise<Record<string, any>> => {
  try {
    const result = await parseMetadata(file, {
      args: ['-json', '-n', '-G'],
      fetch: async (url: any, options: any) => {
        const urlStr = String(url);
        if (urlStr.includes('zeroperl.wasm')) {
          const targets = [zeroperlWasmUrl, '/node_modules/@6over3/zeroperl-ts/dist/esm/zeroperl.wasm'];
          for (const target of targets) {
            if (!target) continue;
            try {
              const res = await fetch(target, options);
              if (res.ok) {
                const contentType = res.headers.get('content-type');
                if (contentType?.includes('text/html')) continue;
                return res;
              }
            } catch {
              // try next target
            }
          }
          return fetch(url, options);
        }
        return fetch(url, options);
      },
    });

    if (result.success) {
      let data = result.data;
      if (typeof data === 'string') {
        try {
          const parsed = JSON.parse(data);
          data = Array.isArray(parsed) ? parsed[0] : parsed;
        } catch {
          // return empty if unparseable
        }
      }
      return (data as Record<string, any>) || {};
    } else {
      throw new Error(result.error || 'Engine failure during file read.');
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Engine failure during file read.';
    throw new Error(message, { cause: error });
  }
};

export const getGPSData = (metadata: Record<string, any>) => {
  if (!metadata) return null;

  const findValue = (key: string) => {
    if (metadata[key] !== undefined) return metadata[key];
    for (const fullKey in metadata) {
      if (fullKey.endsWith(`:${key}`)) return metadata[fullKey];
    }
    return undefined;
  };

  const lat = findValue('GPSLatitude') || findValue('latitude');
  const lon = findValue('GPSLongitude') || findValue('longitude');

  if (typeof lat === 'number' && typeof lon === 'number') {
    return { lat, lon, url: `https://www.google.com/maps?q=${lat},${lon}` };
  }
  return null;
};
