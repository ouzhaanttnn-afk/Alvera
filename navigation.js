(() => {
  'use strict';
  const button = document.querySelector('.menu-toggle');
  const panel = document.querySelector('.menu-panel');
  if (!button || !panel) return;
  const originalPosition = document.createComment('Mobile menu button position');
  button.before(originalPosition);
  const background = [...document.querySelectorAll('.site-header, main, footer, .skip-link, .contact-dock')];
  const previousInert = new Map();
  let open = false;
  let previousFocus = null;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Ana menü');
  panel.setAttribute('aria-hidden', 'true');
  panel.inert = true;

  function focusable() {
    return [...panel.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter(element => !element.hidden && element.getClientRects().length > 0);
  }

  function setMenu(next, restoreFocus = true) {
    if (next === open) return;
    open = next;
    document.body.classList.toggle('menu-open', open);
    document.dispatchEvent(new Event('alvera:overlay'));
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Menüyü kapat' : 'Menüyü aç');
    if (open) {
      previousFocus = document.activeElement;
      panel.inert = false;
      panel.setAttribute('aria-hidden', 'false');
      panel.prepend(button);
      for (const element of background) {
        previousInert.set(element, element.inert);
        element.inert = true;
      }
      (panel.querySelector('a[href]') || button).focus({ preventScroll: true });
    } else {
      for (const [element, value] of previousInert) element.inert = value;
      previousInert.clear();
      originalPosition.after(button);
      if (restoreFocus) {
        const target = previousFocus?.isConnected && previousFocus.getClientRects().length ? previousFocus : button;
        target.focus({ preventScroll: true });
      }
      panel.inert = true;
      panel.setAttribute('aria-hidden', 'true');
    }
  }

  button.addEventListener('click', () => setMenu(!open));
  panel.querySelectorAll('a[href]').forEach(link => {
    link.addEventListener('click', () => {
      setMenu(false, false);
      if (link.dataset.navigationCategory) document.dispatchEvent(new CustomEvent('alvera:category', { detail: link.dataset.navigationCategory }));
      const href = link.getAttribute('href');
      const target = href?.startsWith('#') ? document.getElementById(href.slice(1)) : null;
      if (!target) { button.focus({ preventScroll: true }); return; }
      const hadTabIndex = target.hasAttribute('tabindex');
      if (!hadTabIndex) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
      if (!hadTabIndex) target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true });
    });
  });
  document.addEventListener('keydown', event => {
    if (!open) return;
    if (event.key === 'Escape') { event.preventDefault(); setMenu(false); return; }
    if (event.key !== 'Tab') return;
    const elements = focusable();
    const first = elements[0], last = elements[elements.length - 1];
    if (!first) { event.preventDefault(); return; }
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !panel.contains(active))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
      event.preventDefault(); first.focus();
    }
  });
  document.addEventListener('focusin', event => {
    if (open && !panel.contains(event.target)) (focusable()[0] || button).focus();
  });
  window.matchMedia('(min-width: 901px)').addEventListener('change', event => {
    if (event.matches && open) {
      setMenu(false, false);
      document.querySelector('.header-nav a')?.focus({ preventScroll: true });
    }
  });
  window.addEventListener('pagehide', () => { if (open) setMenu(false, false); });
})();
