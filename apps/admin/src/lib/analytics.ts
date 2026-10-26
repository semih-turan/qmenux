const TZ = 'Europe/Istanbul';

/** The API only returns days with scans; fill the 30-day window (Istanbul calendar days) with zeros. */
export function fillDays(rows: { day: string; total: number }[], now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  const byDay = new Map(rows.map((r) => [r.day, r.total]));
  const out: { day: string; total: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const day = new Date(Date.UTC(y, m - 1, d - i)).toISOString().slice(0, 10);
    out.push({ day, total: byDay.get(day) ?? 0 });
  }
  return out;
}
