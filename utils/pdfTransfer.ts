/**
 * In-memory transfer buffer for passing a generated PDF from PDF Maker to PDF Editor.
 * Avoids sessionStorage size limits (base64-encoded PDFs from images can exceed 5 MB).
 */
let pendingBytes: Uint8Array | null = null;
let pendingName: string = 'from-pdf-maker.pdf';

export function setPendingPdf(bytes: Uint8Array, name: string): void {
  pendingBytes = bytes;
  pendingName = name;
}

export function takePendingPdf(): { bytes: Uint8Array; name: string } | null {
  if (!pendingBytes) return null;
  const result = { bytes: pendingBytes, name: pendingName };
  pendingBytes = null;
  pendingName = 'from-pdf-maker.pdf';
  return result;
}
