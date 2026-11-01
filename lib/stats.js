// Çerezsiz ziyaret ve tıklama sayacı. Yalnızca günlük toplamlar tutulur:
// IP adresi, tarayıcı bilgisi, çerez, kimlik, adres veya ziyaret yolu SAKLANMAZ.
export const EVENTS = ['view', 'whatsapp', 'call', 'directions', 'instagram', 'calculator'];
export const KEEP_DAYS = 90;
// Bir günde bir olay için en çok sayılacak değer: sahte isteklerle sayının şişirilmesini sınırlar.
export const DAY_CAP = 50000;

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' });
export const istanbulDay = (date = new Date()) => dayFormat.format(date);

export function addDays(day, delta) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

const count = (value) => (Number.isSafeInteger(value) && value > 0 ? value : 0);

// Belgeyi yerinde günceller. Bilinmeyen olay sayılmaz.
export function record(value, event, now = new Date()) {
  if (!EVENTS.includes(event)) return false;
  value.schema = 1;
  if (!value.days || typeof value.days !== 'object') value.days = {};
  const today = istanbulDay(now);
  const bucket = (value.days[today] ||= {});
  if (count(bucket[event]) < DAY_CAP) bucket[event] = count(bucket[event]) + 1;
  const oldest = addDays(today, -KEEP_DAYS);
  for (const key of Object.keys(value.days)) if (key < oldest) delete value.days[key];
  return true;
}

// Yönetim paneli için son `span` günün özeti (bugünden geriye, boş günler sıfırla).
export function summary(value, now = new Date(), span = 30) {
  const today = istanbulDay(now);
  const days = [];
  for (let i = 0; i < span; i++) {
    const day = addDays(today, -i);
    const bucket = value?.days?.[day] || {};
    days.push({ day, ...Object.fromEntries(EVENTS.map((event) => [event, count(bucket[event])])) });
  }
  const total = (rows) => Object.fromEntries(EVENTS.map((event) => [event, rows.reduce((sum, row) => sum + row[event], 0)]));
  return { days, totals7: total(days.slice(0, 7)), totals30: total(days), keepDays: KEEP_DAYS };
}
