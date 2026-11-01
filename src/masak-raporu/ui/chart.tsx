import { formatDate } from '../dates';
import { formatKurus } from '../money';

/**
 * Tek seri çubuk grafik (sunucuda çizilir): lejant yok, başlık seriyi adlandırır; tabana oturan 4px yuvarlatılmış
 * uçlar, çubuklar arasında boşluk, sade ızgara; her çubukta üzerine gelince açıklama (title) ve eşdeğer tablo görünümü.
 */
export function DailyChart({ days }: { days: { day: string; count: number; total: string }[] }) {
  const W = 640, H = 220, L = 56, B = 26, T = 10;
  const values = days.map((d) => Number(BigInt(d.total) / 100n));
  const max = Math.max(1, ...values);
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const slot = (W - L - 8) / Math.max(1, days.length);
  const bw = Math.max(3, Math.min(22, slot - 2));
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const every = Math.ceil(days.length / 8);
  if (!days.length) return <p className="mr-hint">Seçilen dönemde veri yok.</p>;
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Günlük işlem tutarı grafiği, ${days.length} gün. Ayrıntılar aşağıdaki tabloda.`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - 4} y1={y(t)} y2={y(t)} stroke="#efe6db" strokeWidth={1} />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="#5f4d40">{compact(t)}</text>
          </g>
        ))}
        {days.map((d, i) => {
          const v = values[i];
          const x = L + i * slot + (slot - bw) / 2;
          const h = Math.max(0, y(0) - y(v));
          const r = Math.min(4, bw / 2, h);
          return (
            <g key={d.day}>
              <rect x={L + i * slot} y={T} width={slot} height={H - T - B} fill="transparent">
                <title>{`${formatDate(d.day)}: ${formatKurus(d.total)} · ${d.count} işlem`}</title>
              </rect>
              {h > 0 && <path d={`M${x},${y(0)} V${y(v) + r} Q${x},${y(v)} ${x + r},${y(v)} H${x + bw - r} Q${x + bw},${y(v)} ${x + bw},${y(v) + r} V${y(0)} Z`} fill="#8a5a35" pointerEvents="none" />}
              {i % every === 0 && <text x={x + bw / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="#5f4d40">{d.day.slice(8, 10)}.{d.day.slice(5, 7)}</text>}
            </g>
          );
        })}
        <line x1={L} x2={W - 4} y1={y(0)} y2={y(0)} stroke="#cdbfae" strokeWidth={1} />
      </svg>
      <details className="mt-2 text-[13px]">
        <summary className="font-semibold text-[#794c2b]">Tablo olarak göster</summary>
        <table className="mr-table mt-2">
          <thead><tr><th scope="col">Gün</th><th scope="col" className="mr-num">İşlem</th><th scope="col" className="mr-num">Tutar</th></tr></thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.day}><td>{formatDate(d.day)}</td><td className="mr-num">{d.count}</td><td className="mr-num">{formatKurus(d.total)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

function niceStep(raw: number) {
  const p = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) || p * 10;
}
function compact(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} Mn`;
  if (v >= 1_000) return `${(v / 1_000).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} B`;
  return String(v);
}
