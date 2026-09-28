(() => {
  const body = document.body;
  const year = document.querySelector('#year');
  const gallery = document.querySelector('.gallery');
  const cards = gallery.querySelectorAll('.gallery-card');

  year.textContent = new Date().getFullYear();

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
    const glow = document.querySelector('.pointer-glow');
    let x = -100;
    let y = -100;
    let frame = 0;
    body.classList.add('cursor-ready');

    document.addEventListener('pointermove', (event) => {
      x = event.clientX;
      y = event.clientY;
      cursor.classList.add('is-visible');
      glow.classList.add('is-visible');
      cursor.classList.toggle('is-hovering', Boolean(event.target.closest('a, button')));
      if (frame) return;
      frame = requestAnimationFrame(() => {
        cursor.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
        glow.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
        frame = 0;
      });
    });
    document.addEventListener('pointerout', (event) => {
      if (!event.relatedTarget) {
        cursor.classList.remove('is-visible');
        glow.classList.remove('is-visible');
      }
    });
  }
})();
