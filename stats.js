// Çerezsiz sayaç: sayfa açılışını ve iletişim bağlantılarına tıklamayı günlük toplam olarak bildirir.
// Tarayıcıya hiçbir şey kaydedilmez, istekle çerez gönderilmez, kişiye ait bilgi iletilmez.
(() => {
  'use strict';
  try {
    // Robot, "izlenmek istemiyorum" tercihi ve mağaza sahibinin kendi cihazı sayılmaz.
    if (navigator.webdriver) return;
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true) return;
    if (localStorage.getItem('alvera.owner') === '1') return;
  } catch { /* Depolama kapalıysa ziyaretçi sayılır. */ }

  function send(event) {
    try {
      fetch('/api/hit', { method: 'POST', credentials: 'omit', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ e: event }) }).catch(() => {});
    } catch { /* Sayaç hatası siteyi etkilemez. */ }
  }
  function kind(target) {
    if (target.closest('#calc-ask')) return 'calculator';
    const link = target.closest('a[href]');
    const href = link ? link.getAttribute('href') || '' : '';
    if (href.startsWith('https://wa.me/')) return 'whatsapp';
    if (href.startsWith('tel:')) return 'call';
    if (/google\.com\/maps|maps\.app\.goo\.gl/.test(href)) return 'directions';
    if (/^https:\/\/(www\.)?instagram\.com\//.test(href)) return 'instagram';
    return '';
  }

  send('view');
  document.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    const name = kind(event.target);
    if (name) send(name);
  }, { capture: true });
})();
