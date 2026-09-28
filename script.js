(() => {
  const body = document.body;
  const menuButton = document.querySelector('.menu-toggle');
  const menuPanel = document.querySelector('.menu-panel');
  const menuLinks = menuPanel.querySelectorAll('a');
  const year = document.querySelector('#year');
  const gallery = document.querySelector('.gallery');
  const cards = gallery.querySelectorAll('.gallery-card');
  const ratesBody = document.querySelector('#rates-body');
  const ratesStatus = document.querySelector('#rates-status');
  const ratesPanel = document.querySelector('.rates-panel');
  const goldSource = 'https://static.altinkaynak.com/public/Gold';
  const rateTypes = [
    ['PGA', 'Gram Altın'],
    ['PC', 'Çeyrek Altın'],
    ['PY', 'Yarım Altın'],
    ['PA', 'Ata Cumhuriyet'],
    ['PB', '22 Ayar Bilezik']
  ];
  let displayedRateTime = 0;

  year.textContent = new Date().getFullYear();

  function sourceTime(value) {
    const match = /^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(value || '');
    return match ? `${match[3]}-${match[2]}-${match[1]}T${match[4]}:${match[5]}:${match[6]}+03:00` : '';
  }

  function normalizeRates(data) {
    if (!Array.isArray(data)) return data;
    const rows = rateTypes.map(([code, name]) => {
      const item = data.find((entry) => entry.Kod === code);
      if (!item) throw new Error(`Eksik fiyat: ${code}`);
      return { code, name, buy: item.Alis, sell: item.Satis };
    });
    return { source_updated_at: sourceTime(data.find((item) => item.Kod === 'PGA')?.GuncellenmeZamani), prices: rows };
  }

  function priceText(value) {
    const number = Number(String(value).replaceAll('.', '').replace(',', '.'));
    if (!Number.isFinite(number) || number <= 0) throw new Error('Geçersiz fiyat');
    return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number) + ' ₺';
  }

  function renderRates(input) {
    const data = normalizeRates(input);
    const timestamp = Date.parse(data.source_updated_at);
    if (!Number.isFinite(timestamp) || !Array.isArray(data.prices) || data.prices.length !== rateTypes.length || timestamp < displayedRateTime) throw new Error('Geçersiz veya eski fiyat verisi');
    const rows = document.createDocumentFragment();
    rateTypes.forEach(([code, name]) => {
      const item = data.prices.find((entry) => entry.code === code);
      if (!item) throw new Error(`Eksik fiyat: ${code}`);
      const row = document.createElement('tr');
      const label = document.createElement('td');
      const buy = document.createElement('td');
      const sell = document.createElement('td');
      label.textContent = name;
      buy.textContent = priceText(item.buy);
      sell.textContent = priceText(item.sell);
      row.append(label, buy, sell);
      rows.append(row);
    });
    ratesBody.replaceChildren(rows);
    displayedRateTime = timestamp;
    const updated = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Istanbul' }).format(timestamp);
    const stale = Date.now() - timestamp > 2 * 60 * 60 * 1000;
    ratesPanel.classList.toggle('is-stale', stale);
    ratesStatus.textContent = stale ? `Gecikmeli veri · Altınkaynak: ${updated}` : `Altınkaynak güncellemesi: ${updated}`;
  }

  async function loadGoldPrices() {
    let loaded = displayedRateTime > 0;
    try {
      const response = await fetch('/api/prices', { cache: 'no-store' });
      if (!response.ok) throw new Error('Fiyat servisi yanıt vermedi');
      renderRates(await response.json());
      return;
    } catch { /* Yerel dosya ve doğrudan kaynak yedekleri aşağıda. */ }

    try {
      const snapshot = await fetch('prices.json', { cache: 'no-store' });
      if (!snapshot.ok) throw new Error('Fiyat dosyası okunamadı');
      renderRates(await snapshot.json());
      loaded = true;
    } catch { /* Yayındaki son başarılı değer varsa onu koru. */ }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    try {
      const response = await fetch(goldSource, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('Altınkaynak yanıt vermedi');
      renderRates(await response.json());
      loaded = true;
    } catch {
      if (!loaded) {
        ratesStatus.textContent = 'Fiyatlara şu anda ulaşılamıyor';
        ratesBody.innerHTML = '<tr><td colspan="3" class="rates-loading">Güncel değerler için Altınkaynak bağlantısını açın.</td></tr>';
      }
    } finally { clearTimeout(timeout); }
  }

  loadGoldPrices();
  window.setInterval(loadGoldPrices, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadGoldPrices(); });

  function setMenu(open) {
    body.classList.toggle('menu-open', open);
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Menüyü kapat' : 'Menüyü aç');
    menuPanel.setAttribute('aria-hidden', String(!open));
    menuPanel.inert = !open;
    if (open) menuLinks[0].focus();
    else menuButton.focus();
  }

  menuButton.addEventListener('click', () => setMenu(!body.classList.contains('menu-open')));
  menuLinks.forEach((link) => link.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && body.classList.contains('menu-open')) setMenu(false);
  });

  const revealItems = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    body.classList.add('motion-ready');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' });
    revealItems.forEach((item) => observer.observe(item));
  }

  function clearGalleryFocus() {
    body.classList.remove('gallery-focused');
    cards.forEach((card) => card.classList.remove('is-active'));
  }

  cards.forEach((card) => {
    const focusCard = () => {
      cards.forEach((other) => other.classList.toggle('is-active', other === card));
      body.classList.add('gallery-focused');
    };
    card.addEventListener('pointerenter', focusCard);
    card.addEventListener('focus', focusCard);
    card.addEventListener('pointerleave', clearGalleryFocus);
    card.addEventListener('blur', clearGalleryFocus);
  });
  gallery.addEventListener('pointerleave', clearGalleryFocus);

  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
  if (finePointer.matches) {
    const cursor = document.querySelector('.cursor');
    let x = -100;
    let y = -100;
    let frame = 0;
    body.classList.add('cursor-ready');

    document.addEventListener('pointermove', (event) => {
      x = event.clientX;
      y = event.clientY;
      cursor.classList.add('is-visible');
      cursor.classList.toggle('is-hovering', Boolean(event.target.closest('a, button')));
      if (frame) return;
      frame = requestAnimationFrame(() => {
        cursor.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
        frame = 0;
      });
    });
    document.addEventListener('pointerout', (event) => {
      if (!event.relatedTarget) cursor.classList.remove('is-visible');
    });
  }
})();
