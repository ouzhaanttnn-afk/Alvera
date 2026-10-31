// Liquid glass: glass surfaces catch a soft highlight that follows the pointer.
(() => {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const surfaces = '.site-header, .hero-link, .hero-secondary, .header-call, .visitor-request-link, .product-enquiry, .masak-entry, .masak-entry > a, .visit-actions a, .visit-note, .visit-note .text-link, .rates-panel, .rates-refresh, .visitor-request, .approach-step, .visitor-question-list, .search-toggle, .catalog-filters button, .search-categories button, .site-search-dialog, .product-dialog';
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
