(() => {
  'use strict';
  const panel = document.querySelector('.rates-panel');
  const body = document.querySelector('#rates-body');
  const status = document.querySelector('#rates-status');
  if (!panel || !body || !status) return;

  const products = [['PGA', 'Gram Altın'], ['PC', 'Çeyrek Altın'], ['PY', 'Yarım Altın'], ['PA', 'Ata Cumhuriyet'], ['PB', '22 Ayar Bilezik']];
  const endpoints = ['/api/prices'];
  const karatCodes = { 24: 'PGA', 22: 'PB', 18: 'P18', 14: 'P14' };
  const storageKey = 'alvera.gold.last-good.v1';
  const freshnessLimit = 20 * 60 * 1000;
  const formatter = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dateFormatter = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Istanbul' });
  const refreshButton = document.querySelector('.rates-refresh');
  let current = null;
  let busy = false;
  let connection = 'loading';
  let activeController = null;
  let pageAway = false;

  function sourceTime(value) {
    if (typeof value !== 'string') throw new Error('Missing source timestamp');
    const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
    const normalized = match ? match[3] + '-' + match[2] + '-' + match[1] + 'T' + match[4] + ':' + match[5] + ':' + match[6] + '+03:00' : value;
    const result = Date.parse(normalized);
    if (!Number.isFinite(result) || result > Date.now() + 5 * 60 * 1000) throw new Error('Invalid source timestamp');
    return result;
  }

  function amount(value) {
    const parsed = typeof value === 'number' ? value : Number(String(value).replaceAll('.', '').replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('Invalid price');
    return parsed;
  }

  function normalize(input) {
    const raw = Array.isArray(input);
    const entries = raw ? input : input?.prices;
    if (!Array.isArray(entries)) throw new Error('Invalid price response');
    const byCode = new Map(entries.map(item => [raw ? item.Kod : item.code, item]));
    const timestamp = sourceTime(raw ? byCode.get('PGA')?.GuncellenmeZamani : input.source_updated_at);
    const prices = products.map(([code, name]) => {
      const item = byCode.get(code);
      if (!item) throw new Error('Missing price: ' + code);
      return { code, name, buy: amount(raw ? item.Alis : item.buy), sell: amount(raw ? item.Satis : item.sell) };
    });
    const calc = {};
    for (const [karat, code] of Object.entries(karatCodes)) {
      const item = byCode.get(code);
      // Yerel önbellekte yalnızca tablo ürünleri bulunur; hesaplayıcı fiyatları ayrı saklanır.
      const saved = raw ? null : input.calc?.[karat];
      try {
        if (item) calc[karat] = { buy: amount(raw ? item.Alis : item.buy), sell: amount(raw ? item.Satis : item.sell) };
        else if (saved) calc[karat] = { buy: amount(saved.buy), sell: amount(saved.sell) };
      } catch { /* Bu ayar hesaplayıcıdan çıkar. */ }
    }
    return { source_updated_at: new Date(timestamp).toISOString(), timestamp, prices, calc, stale: !raw && input.stale === true };
  }

  function showEmpty(message) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 3;
    cell.className = 'rates-loading';
    cell.textContent = message;
    row.append(cell);
    body.replaceChildren(row);
  }

  function showPrices(data) {
    const rows = data.prices.map(item => {
      const row = document.createElement('tr');
      const label = document.createElement('th');
      label.scope = 'row';
      label.textContent = item.name;
      row.append(label);
      for (const value of [item.buy, item.sell]) {
        const cell = document.createElement('td');
        cell.textContent = formatter.format(value) + ' ₺';
        row.append(cell);
      }
      return row;
    });
    body.replaceChildren(...rows);
    updateCalculator();
  }


  // ---- Gram hesaplayıcı: bilgilendirme amaçlı değer gösterir, fiyat teklifi değildir ----
  const calcForm = document.querySelector('#rates-calc');
  const calcKarat = document.querySelector('#calc-karat');
  const calcGrams = document.querySelector('#calc-grams');
  const calcResult = document.querySelector('#calc-result');
  const calcAsk = document.querySelector('#calc-ask');
  function parseGrams(text) {
    const value = String(text).trim().replace(',', '.');
    if (!/^\d{1,5}(\.\d{1,3})?$/.test(value)) return null;
    const [whole, fraction = ''] = value.split('.');
    const milligrams = BigInt(whole) * 1000n + BigInt((fraction + '000').slice(0, 3));
    return milligrams > 0n && milligrams <= 100000000n ? milligrams : null;
  }
  // Kuruşa tam sayı olarak çevrilir; kayan nokta yuvarlama hatası olmaz.
  function worth(milligrams, price) { return Number((milligrams * BigInt(Math.round(price * 100)) + 500n) / 1000n) / 100; }
  function updateCalculator() {
    if (!calcForm) return;
    const available = Object.keys(current?.calc || {});
    calcForm.hidden = !available.length;
    if (!available.length) return;
    for (const option of calcKarat.options) { option.hidden = option.disabled = !available.includes(option.value); }
    if (!available.includes(calcKarat.value)) calcKarat.value = available[0];
    const milligrams = parseGrams(calcGrams.value);
    const entry = current.calc[calcKarat.value];
    calcAsk.disabled = !milligrams;
    if (!milligrams) {
      calcResult.replaceChildren(Object.assign(document.createElement('p'), { className: 'rates-calc-hint', textContent: calcGrams.value.trim() ? 'Gramı 12,5 gibi girin (en fazla 3 ondalık).' : 'Gram girin; alış ve satış değerini görün.' }));
      return;
    }
    const rows = [['Alış değeri', worth(milligrams, entry.buy)], ['Satış değeri', worth(milligrams, entry.sell)]].map(([label, amountValue]) => {
      const wrap = document.createElement('div');
      const term = document.createElement('dt'); term.textContent = label;
      const detail = document.createElement('dd'); detail.textContent = formatter.format(amountValue) + ' ₺';
      wrap.append(term, detail);
      return wrap;
    });
    const list = document.createElement('dl');
    list.append(...rows);
    calcResult.replaceChildren(list);
  }
  if (calcForm) {
    calcForm.addEventListener('input', updateCalculator);
    calcForm.addEventListener('submit', event => event.preventDefault());
    calcAsk.addEventListener('click', () => {
      const grams = calcGrams.value.trim().replace('.', ',');
      const number = (document.querySelector('a[href^="https://wa.me/"]')?.getAttribute('href') || 'https://wa.me/905334853040').split('?')[0];
      const text = 'Merhaba, ' + grams + ' gram ' + calcKarat.value + ' ayar altın için bilgi almak istiyorum.';
      window.open(number + '?text=' + encodeURIComponent(text), '_blank', 'noopener');
    });
  }

  function updateStatus() {
    const offline = !navigator.onLine;
    const old = current && Date.now() - current.timestamp > freshnessLimit;
    const verified = connection === 'online' && !offline;
    const behind = current?.stale === true;
    const state = !current ? (busy && !offline ? 'loading' : offline ? 'offline' : 'error') : offline ? 'offline' : verified && !old && !behind ? 'live' : 'stale';
    panel.dataset.state = state;
    panel.classList.toggle('is-stale', state !== 'live');
    panel.classList.toggle('is-refreshing', busy);
    panel.setAttribute('aria-busy', String(busy));
    if (refreshButton) {
      refreshButton.disabled = busy;
      refreshButton.textContent = busy ? 'Güncelleniyor...' : 'Yenile';
    }
    let message;
    if (!current) {
      message = offline ? 'İnternet bağlantısı yok. Fiyatlar doğrulanamıyor.' : busy ? 'Güncel fiyatlar alınıyor' : 'Fiyatlar şu anda alınamıyor. Yeniden deneyebilir veya mağazamıza sorabilirsiniz.';
    } else {
      const date = dateFormatter.format(new Date(current.timestamp));
      if (offline) message = 'Bağlantı yok · Son alınan veri: ' + date;
      else if (connection === 'error') message = 'Güncelleme başarısız · Son alınan veri: ' + date;
      else if (behind && connection === 'online') message = 'Kaynağa şu an ulaşılamıyor · Son alınan veri: ' + date;
      else if (connection === 'cache') message = 'Kaydedilmiş veri · ' + date + ' · Güncellik doğrulanıyor';
      else if (old) message = 'Gecikmeli veri · ' + date;
      else message = 'Son güncelleme: ' + date;
    }
    if (status.textContent !== message) status.textContent = message;
  }

  async function request(url, timeout) {
    const controller = new AbortController();
    activeController = controller;
    const timer = window.setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('Price service unavailable');
      return normalize(await response.json());
    } finally {
      clearTimeout(timer);
      if (activeController === controller) activeController = null;
    }
  }

  async function refresh() {
    if (busy || pageAway) return;
    if (!navigator.onLine) { updateStatus(); return; }
    busy = true;
    updateStatus();
    let received = false;
    try {
      for (let i = 0; i < endpoints.length; i++) {
        if (pageAway) break;
        try {
          const data = await request(endpoints[i], i === 0 ? 9500 : 5000);
          if (current && data.timestamp < current.timestamp) throw new Error('Older feed rejected');
          current = data;
          connection = 'online';
          showPrices(data);
          try { localStorage.setItem(storageKey, JSON.stringify({ version: 1, data })); } catch { /* Storage may be unavailable. */ }
          received = true;
          break;
        } catch { /* Try the official source; never invent or reset prices. */ }
      }
      if (!received && !pageAway) {
        connection = 'error';
        if (!current) showEmpty('Fiyat bilgisine şu anda ulaşılamıyor.');
      }
    } finally {
      busy = false;
      updateStatus();
    }
  }

  try {
    const cached = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (cached?.version === 1) {
      current = normalize(cached.data);
      connection = 'cache';
      showPrices(current);
    }
  } catch { /* A missing or corrupt cache is not a live price. */ }
  updateStatus();
  refresh();
  refreshButton?.addEventListener('click', refresh);
  window.setInterval(() => { if (!document.hidden) refresh(); }, 5 * 60 * 1000);
  window.setInterval(() => { if (!document.hidden) updateStatus(); }, 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { updateStatus(); refresh(); } });
  window.addEventListener('online', refresh);
  window.addEventListener('offline', updateStatus);
  window.addEventListener('pagehide', () => { pageAway = true; activeController?.abort(); });
  window.addEventListener('pageshow', event => { pageAway = false; if (event.persisted) refresh(); });
})();
