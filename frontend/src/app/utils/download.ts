/**
 * Browser download helpers. Presigned S3 URLs are cross-origin, so the anchor
 * `download` attribute is ignored — fetch the bytes and save the blob instead.
 */

export function downloadBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export async function downloadUrl(url: string, filename: string): Promise<void> {
  const res = await fetch(url);
  downloadBlob(await res.blob(), filename);
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

/** Filesystem-friendly name: "Balrog the Warrior" → "balrog_the_warrior". */
export function fileSlug(name: string, fallback = 'sprite'): string {
  return name.replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || fallback;
}
