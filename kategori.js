// Kategori sayfası: /kategori/<anahtar>. Ürünler /api/catalog'dan gelir; yalnızca yayımlanmış ürünler gösterilir.
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const ORDER = ['pirlanta', 'yuzuk', 'kolye', 'kupe', 'bileklik', 'bilezik', 'hediye', 'ozel'];
  const key = (location.pathname.match(/^\/kategori\/([a-z]+)\/?$/) || [])[1] || new URLSearchParams(location.search).get('k') || '';
  let catalog = null, sort = 'onerilen', number = '905334853040';
  try { const saved = sessionStorage.getItem('alvera.kategori.sort'); if (['onerilen', 'yeni', 'az'].includes(saved)) sort = saved; } catch { /* depolama kapalı olabilir */ }

  const wa = (text) => 'https://wa.me/' + number + '?text=' + encodeURIComponent(text);
  const photoOf = (id) => catalog.media.find((m) => m.id === id);

  function el(tag, props = {}, ...children) {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children.filter((c) => c !== null && c !== undefined && c !== ''));
    return node;
  }

  function tabs() {
    const box = $('[data-k-tabs]');
    box.replaceChildren(...ORDER.filter((k) => catalog.categories[k]).map((k) => {
      const count = catalog.products.filter((p) => p.category === k).length;
      const a = el('a', { href: '/kategori/' + k, className: 'k-tab' }, catalog.categories[k], count ? el('span', { className: 'k-tab-count', textContent: String(count) }) : null);
      if (k === key) { a.setAttribute('aria-current', 'page'); }
      return a;
    }));
    box.querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  function sorted(list) {
    const copy = [...list];
    if (sort === 'yeni') copy.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    else if (sort === 'az') copy.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    else copy.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return copy;
  }

  function render() {
    const grid = $('[data-k-grid]');
    const products = sorted(catalog.products.filter((p) => p.category === key));
    grid.setAttribute('aria-busy', 'false');
    $('[data-k-tools]').hidden = !products.length;
    $('[data-k-empty]').hidden = products.length > 0;
    $('[data-k-count]').textContent = products.length + ' model';
    grid.replaceChildren(...products.map((p, i) => {
      const photo = photoOf(p.images[0]);
      const img = el('img', { src: photo?.url || '/assets/alvera-monogram.svg', alt: p.name, loading: i < 4 ? 'eager' : 'lazy', decoding: 'async', width: photo?.width || 800, height: photo?.height || 1000 });
      const card = el('a', { className: 'k-card', href: '?urun=' + p.id },
        el('span', { className: 'k-card-photo' }, img),
        el('span', { className: 'k-card-copy' },
          p.sku ? el('small', { textContent: p.sku }) : null,
          el('strong', { textContent: p.name }),
          p.metal ? el('span', { className: 'k-card-metal', textContent: p.metal }) : null));
      card.dataset.product = p.id;
      card.addEventListener('click', (e) => { e.preventDefault(); open(p.id, true); });
      return card;
    }));
  }

  // ---- Ürün penceresi ----
  const dialog = $('[data-k-dialog]');
  let opener = null;
  function open(id, push) {
    const p = catalog.products.find((x) => x.id === id && x.category === key);
    if (!p) return;
    opener = document.activeElement;
    const photos = p.images.map(photoOf).filter(Boolean);
    const main = $('[data-k-photo]');
    main.src = photos[0]?.url || '/assets/alvera-monogram.svg';
    main.alt = p.name;
    $('[data-k-thumbs]').replaceChildren(...(photos.length > 1 ? photos.map((m, i) => {
      const b = el('button', { type: 'button', className: 'k-thumb' }, el('img', { src: m.url, alt: '' }));
      b.setAttribute('aria-label', (i + 1) + '. fotoğrafı göster');
      b.setAttribute('aria-pressed', String(i === 0));
      b.addEventListener('click', () => { main.src = m.url; $('[data-k-thumbs]').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); });
      return b;
    }) : []));
    $('[data-k-dcat]').textContent = catalog.categories[p.category] + (p.sku ? ' / ' + p.sku : '');
    $('[data-k-dname]').textContent = p.name;
    $('[data-k-dmetal]').textContent = p.metal || '';
    $('[data-k-dmetal]').hidden = !p.metal;
    $('[data-k-ddesc]').textContent = p.description || '';
    $('[data-k-ddesc]').hidden = !p.description;
    const link = location.origin + '/kategori/' + key + '?urun=' + p.id;
    $('[data-k-dask]').href = wa('Merhaba, ' + p.name + (p.sku ? ' (' + p.sku + ')' : '') + ' hakkında bilgi almak istiyorum. ' + link);
    $('[data-k-share-status]').textContent = '';
    dialog.dataset.product = p.id;
    if (push) history.pushState({ urun: p.id }, '', '?urun=' + p.id);
    if (!dialog.open) dialog.showModal();
  }
  function close(pop) {
    if (dialog.open) dialog.close();
    if (!pop && new URLSearchParams(location.search).has('urun')) history.pushState({}, '', location.pathname);
  }
  $('[data-k-close]').addEventListener('click', () => close(false));
  dialog.addEventListener('click', (e) => { if (e.target === dialog) close(false); });
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(false); });
  dialog.addEventListener('close', () => opener?.focus?.());
  window.addEventListener('popstate', () => {
    const id = new URLSearchParams(location.search).get('urun');
    if (id) open(id, false); else close(true);
  });
  $('[data-k-share]').addEventListener('click', async () => {
    const url = location.origin + '/kategori/' + key + '?urun=' + dialog.dataset.product;
    const status = $('[data-k-share-status]');
    try {
      if (navigator.share) { await navigator.share({ title: $('[data-k-dname]').textContent, url }); status.textContent = ''; }
      else { await navigator.clipboard.writeText(url); status.textContent = 'Bağlantı kopyalandı.'; }
    } catch (error) { if (error?.name !== 'AbortError') status.textContent = 'Bağlantı: ' + url; }
  });

  $('[data-k-sort]').value = sort;
  $('[data-k-sort]').addEventListener('change', (e) => {
    sort = e.target.value;
    try { sessionStorage.setItem('alvera.kategori.sort', sort); } catch { /* depolama kapalı olabilir */ }
    render();
  });

  function notFound() {
    document.title = 'Kategori bulunamadı | Alvera Kuyumculuk';
    $('[data-k-title]').textContent = 'Kategori bulunamadı';
    $('[data-k-lead]').textContent = 'Aradığınız kategori yok. Yukarıdaki kategorilerden birini seçebilirsiniz.';
    $('[data-k-grid]').replaceChildren();
    $('[data-k-grid]').setAttribute('aria-busy', 'false');
    const robots = el('meta', { name: 'robots', content: 'noindex' });
    document.head.append(robots);
  }

  fetch('/api/catalog', { cache: 'no-store', signal: AbortSignal.timeout(12000) })
    .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
    .then((data) => {
      catalog = { products: data.products || [], media: data.media || [], categories: data.categories || {}, settings: data.settings || {} };
      if (/^[1-9]\d{9,14}$/.test(catalog.settings.whatsapp || '')) number = catalog.settings.whatsapp;
      document.querySelectorAll('[data-k-whatsapp]').forEach((a) => { a.href = 'https://wa.me/' + number; });
      tabs();
      const label = catalog.categories[key];
      if (!label) { notFound(); return; }
      document.title = label + ' Modelleri | Alvera Kuyumculuk';
      $('[data-k-title]').textContent = label;
      $('[data-k-lead]').textContent = label + ' modellerimizi inceleyin. Ayar, gram ve güncel fiyat bilgisi için mağazamıza danışın.';
      document.querySelector('meta[name="description"]').content = 'Alvera Kuyumculuk ' + label.toLocaleLowerCase('tr-TR') + ' modelleri. Ankara Mamak, Natoyolu.';
      const base = (catalog.settings.siteUrl || location.origin).replace(/\/$/, '');
      document.querySelector('link[rel="canonical"]').href = base + '/kategori/' + key;
      $('[data-k-ask]').href = wa('Merhaba, ' + label + ' modelleri hakkında bilgi almak istiyorum.');
      render();
      const id = new URLSearchParams(location.search).get('urun');
      if (id) open(id, false);
    })
    .catch(() => {
      $('[data-k-grid]').setAttribute('aria-busy', 'false');
      $('[data-k-grid]').replaceChildren(el('p', { className: 'k-loading', textContent: 'Modeller şu anda yüklenemedi. Sayfayı yenileyebilir ya da mağazamıza yazabilirsiniz.' }));
    });
})();
