(() => {
  'use strict';
  const header = document.querySelector('.site-header');
  const links = [...document.querySelectorAll('.header-nav a[href^="#"], .menu-panel a[href^="#"]')];
  const sections = [...document.querySelectorAll('main section[id], #sorular')];
  let frame = 0;
  let activeId = '';

  function updateNavigation() {
    frame = 0;
    header?.classList.toggle('is-scrolled', window.scrollY > 24);
    const offset = (header?.getBoundingClientRect().height || 100) + 36;
    let current = sections[0]?.id || '';
    for (const section of sections) {
      if (section.getBoundingClientRect().top <= offset) current = section.id;
    }
    if (current === activeId) return;
    activeId = current;
    for (const link of links) {
      if (link.getAttribute('href') === '#' + activeId) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  }
  function scheduleNavigation() {
    if (!frame) frame = requestAnimationFrame(updateNavigation);
  }
  window.addEventListener('scroll', scheduleNavigation, { passive: true });
  window.addEventListener('resize', scheduleNavigation, { passive: true });
  window.addEventListener('pageshow', scheduleNavigation);
  window.addEventListener('load', scheduleNavigation, { once: true });
  updateNavigation();

  const category = document.querySelector('#visitor-category');
  const requestLink = document.querySelector('#visitor-request-link');
  if (!category || !requestLink) return;
  const destination = new URL(requestLink.href);
  const messages = {
    pirlanta: 'Merhaba, pırlanta modelleri hakkında bilgi almak istiyorum.',
    yuzuk: 'Merhaba, yüzük modelleri hakkında bilgi almak istiyorum.',
    kolye: 'Merhaba, kolye modelleri hakkında bilgi almak istiyorum.',
    kupe: 'Merhaba, küpe modelleri hakkında bilgi almak istiyorum.',
    bileklik: 'Merhaba, bileklik modelleri hakkında bilgi almak istiyorum.',
    bilezik: 'Merhaba, bilezik modelleri hakkında bilgi almak istiyorum.',
    hediye: 'Merhaba, hediye seçimi için seçenekleriniz hakkında bilgi almak istiyorum.'
  };
  function updateRequest() {
    const url = new URL(destination);
    url.searchParams.set('text', messages[category.value] || 'Merhaba, mağazanızdaki ürünler hakkında bilgi almak istiyorum.');
    requestLink.href = url.href;
  }
  category.addEventListener('change', updateRequest);
  updateRequest();
})();

