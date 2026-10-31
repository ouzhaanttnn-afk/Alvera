// Liquid glass: imleci takip eden parlama ve (destekleyen tarayıcılarda) arka planı büken kırılma filtresi.
(() => {
  const media = (q) => window.matchMedia(q).matches;
  const reduced = media('(prefers-reduced-motion: reduce)') || media('(prefers-reduced-transparency: reduce)');

  // Kırılma: SVG yer değiştirme filtresi yalnızca Chromium'un backdrop-filter desteğinde güvenilir çalışır.
  // Masaüstü (ince imleç) ile sınırlı; diğer tarayıcılar normal bulanık camı kullanır.
  const brands = (navigator.userAgentData && navigator.userAgentData.brands) || [];
  const chromium = brands.some((b) => /Chromium/i.test(b.brand));
  if (chromium && !reduced && media('(hover: hover) and (pointer: fine)')) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    svg.innerHTML =
      '<filter id="lg-refract" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.006 0.011" numOctaves="2" seed="11" result="n"/>' +
      '<feGaussianBlur in="n" stdDeviation="2.4" result="s"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="s" scale="16" xChannelSelector="R" yChannelSelector="G"/></filter>' +
      '';
    document.body.appendChild(svg);
    document.documentElement.classList.add('lg-refract');
  }

  if (!media('(hover: hover) and (pointer: fine)') || reduced) return;
  const surfaces = '.site-header, .hero-link, .hero-secondary, .header-call, .visitor-request-link, .product-enquiry, .masak-entry, .masak-entry > a, .visit-actions a, .visit-note, .visit-note .text-link, .rates-panel, .rates-refresh, .visitor-request, .approach-step, .visitor-question-list, .search-toggle, .catalog-filters button, .search-categories button, .site-search-dialog, .product-dialog, .hero-meta, .contact-dock';
  let target = null, x = 0, y = 0, frame = 0;
  const paint = () => {
    frame = 0;
    if (!target) return;
    const box = target.getBoundingClientRect();
    target.style.setProperty('--lg-x', ((x - box.left) / box.width * 100).toFixed(1) + '%');
    target.style.setProperty('--lg-y', ((y - box.top) / box.height * 100).toFixed(1) + '%');
  };
  document.addEventListener('pointermove', (event) => {
    const next = event.target instanceof Element ? event.target.closest(surfaces) : null;
    if (target && target !== next) { target.style.removeProperty('--lg-x'); target.style.removeProperty('--lg-y'); }
    target = next; x = event.clientX; y = event.clientY;
    if (target && !frame) frame = requestAnimationFrame(paint);
  }, { passive: true });
})();
