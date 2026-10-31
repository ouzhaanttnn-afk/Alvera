// Türkiye saati (Europe/Istanbul) ile tarih işlemleri.

export function istanbulDate(value: Date | string): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) throw new Error('INVALID_DATE');
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value.length === 10 ? `${value}T12:00:00+03:00` : value) : value;
  return new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'medium' }).format(d);
}

/** "31.10.2026 14:30", "31.10.2026", "2026-10-31T14:30" → ISO (Türkiye saati, UTC+3). */
export function parseTurkishDateTime(input: string): string {
  const s = input.trim();
  let m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (m) {
    const [, d, mo, y, h = '12', mi = '00'] = m;
    return checked(`${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T${h.padStart(2, '0')}:${mi}:00+03:00`);
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (m) {
    const [, y, mo, d, h = '12', mi = '00'] = m;
    return checked(`${y}-${mo}-${d}T${h}:${mi}:00+03:00`);
  }
  throw new Error('Tarih biçimi hatalı. Örnek: 31.10.2026 14:30');
}

function checked(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || istanbulDate(d) !== iso.slice(0, 10)) throw new Error('Geçersiz tarih.');
  return d.toISOString();
}

// Resmi tatiller: sabit tarihli olanlar her yıl; dini bayramlar yıl bazında girilir.
// Hukuki/idari takvim doğrulaması gerekir; uyum yetkilisi son tarihi kayıtta elle güncelleyebilir.
const FIXED = ['01-01', '04-23', '05-01', '05-19', '07-15', '08-30', '10-29'];
const RELIGIOUS: Record<string, string[]> = {
  '2026': ['2026-03-20', '2026-03-21', '2026-03-22', '2026-05-27', '2026-05-28', '2026-05-29', '2026-05-30'],
};

export function isBusinessDay(day: string): boolean {
  const d = new Date(`${day}T12:00:00Z`);
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  if (FIXED.includes(day.slice(5))) return false;
  return !(RELIGIOUS[day.slice(0, 4)] || []).includes(day);
}

/** Başlangıç gününden sonraki n iş gününün sonu (Türkiye saati 23:59). */
export function addBusinessDays(start: Date | string, n: number): Date {
  let day = istanbulDate(start);
  let count = 0;
  while (count < n) {
    const d = new Date(`${day}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    day = d.toISOString().slice(0, 10);
    if (isBusinessDay(day)) count++;
  }
  return new Date(`${day}T23:59:00+03:00`);
}
