/** Turkish-aware case/diacritic folding for search and slugs (İ/ı/ş/ğ/ç/ö/ü). */
const MAP: Record<string, string> = {
  ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u',
};

export function foldTr(input: string): string {
  return input
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşüâîû]/g, (c) => MAP[c] ?? c)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function matchesSearch(haystack: readonly (string | null | undefined)[], query: string): boolean {
  const q = foldTr(query).trim();
  if (!q) return true;
  const text = foldTr(haystack.filter(Boolean).join(' '));
  return q.split(/\s+/).every((t) => text.includes(t));
}
