(() => {
  'use strict';
  const dialog = document.querySelector('#site-search-dialog');
  const input = document.querySelector('#site-search-input');
  const status = document.querySelector('.site-search-status');
  const results = document.querySelector('.site-search-results');
  if (!dialog || !input || !status || !results) return;
  let catalog = null, unavailable = false, trigger = null, timer;
  const normalize = value => String(value || '').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/\p{Diacritic}/gu, '').replaceAll('ı', 'i');
  const overlay = () => document.dispatchEvent(new Event('alvera:overlay'));
  function render() {
    results.replaceChildren();
    if (!catalog) { status.textContent = unavailable ? 'Seçki şu anda alınamıyor. Kategorilerden devam edebilir veya mağazamıza yazabilirsiniz.' : 'Seçki yükleniyor…'; return; }
    if (!catalog.products.length) { status.textContent = 'Seçki henüz yayımlanmadı. Kategorileri inceleyebilir veya mağazamıza yazabilirsiniz.'; return; }
    const words = normalize(input.value.trim()).split(/\s+/).filter(Boolean);
    if (!words.length) { status.textContent = 'Ürün adı, kategori veya ürün koduyla arayın.'; return; }
    const matches = catalog.products.filter(product => {
      const content = normalize([product.name, product.description, product.metal, product.sku, catalog.categories[product.category]].join(' '));
      return words.every(word => content.includes(word));
    });
    status.textContent = matches.length ? matches.length + ' sonuç bulundu.' + (matches.length > 12 ? ' İlk 12 sonuç gösteriliyor; aramanızı daraltabilirsiniz.' : '') : 'Bu aramada sonuç bulunamadı. Başka bir kelime deneyin veya kategorilerden devam edin.';
    for (const product of matches.slice(0, 12)) {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = '?urun=' + encodeURIComponent(product.id) + '#koleksiyon';
      link.dataset.searchProduct = product.id;
      const name = document.createElement('strong');
      name.textContent = product.name;
      const description = document.createElement('span');
      description.textContent = [catalog.categories[product.category], product.sku].filter(Boolean).join(' · ');
      link.append(name, description);
      item.append(link);
      results.append(item);
    }
  }
  function close() { if (dialog.open) dialog.close(); }
  document.querySelectorAll('.search-toggle').forEach(button => button.addEventListener('click', () => {
    trigger = button;
    document.body.classList.add('search-open');
    overlay();
    dialog.showModal();
    render();
    input.focus({ preventScroll: true });
  }));
  dialog.querySelector('.site-search-close').addEventListener('click', close);
  dialog.addEventListener('close', () => {
    clearTimeout(timer);
    document.body.classList.remove('search-open');
    overlay();
    trigger?.focus({ preventScroll: true });
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
  });
  dialog.querySelector('form').addEventListener('submit', event => { event.preventDefault(); clearTimeout(timer); render(); });
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(render, 120); });
  results.addEventListener('click', event => {
    const link = event.target.closest('[data-search-product]');
    if (!link) return;
    event.preventDefault();
    const id = link.dataset.searchProduct;
    close();
    document.dispatchEvent(new CustomEvent('alvera:product', { detail: id }));
  });
  dialog.querySelectorAll('[data-search-category]').forEach(button => button.addEventListener('click', () => {
    const category = button.dataset.searchCategory;
    close();
    document.querySelector('#koleksiyon')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    document.dispatchEvent(new CustomEvent('alvera:category', { detail: category }));
  }));
  document.addEventListener('alvera:catalog-ready', event => { catalog = event.detail; unavailable = false; if (dialog.open) render(); });
  document.addEventListener('alvera:catalog-unavailable', () => { unavailable = true; if (dialog.open) render(); });
  window.addEventListener('pagehide', close);
})();
