// Word-based chunking with overlap. Tune per content density; consider
// token-aware chunking later if very long lore docs mix with short sheets.
export function chunkText(text: string, chunkSize = 400, overlap = 60): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunk = words.slice(i, i + chunkSize).join(' ').trim();
    if (chunk) chunks.push(chunk);
    if (i + chunkSize >= words.length) break;
  }
  return chunks;
}
