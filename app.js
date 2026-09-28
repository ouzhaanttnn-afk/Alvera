(() => {
  const $ = (q, root = document) => root.querySelector(q);
  const $$ = (q, root = document) => [...root.querySelectorAll(q)];
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;

  const preloader = $("#preloader");
  const finishIntro = () => setTimeout(() => preloader?.classList.add("done"), 520);
  if (document.readyState === "complete") finishIntro();
  else window.addEventListener("load", finishIntro, { once: true });

  const topbar = $("#topbar");
  const onScroll = () => topbar?.classList.toggle("scrolled", window.scrollY > 24);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  const menuButton = $("#menuButton");
  const mobileMenu = $("#mobileMenu");
  const closeMenu = () => {
    menuButton?.classList.remove("active");
    menuButton?.setAttribute("aria-expanded", "false");
    mobileMenu?.classList.remove("open");
    mobileMenu?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("menu-open");
  };
  menuButton?.addEventListener("click", () => {
    const open = !mobileMenu?.classList.contains("open");
    menuButton.classList.toggle("active", open);
    menuButton.setAttribute("aria-expanded", String(open));
    mobileMenu?.classList.toggle("open", open);
    mobileMenu?.setAttribute("aria-hidden", String(!open));
    document.body.classList.toggle("menu-open", open);
  });
  $$(".mobile-menu a").forEach(a => a.addEventListener("click", closeMenu));

  const reveals = $$(".reveal");
  if ("IntersectionObserver" in window && !reduced) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.13, rootMargin: "0px 0px -4% 0px" });
    reveals.forEach(el => observer.observe(el));
  } else reveals.forEach(el => el.classList.add("visible"));

  if (finePointer && !reduced) {
    const glow = $("#cursorGlow");
    let gx = innerWidth / 2, gy = innerHeight / 2, tx = gx, ty = gy;
    addEventListener("pointermove", e => {
      tx = e.clientX; ty = e.clientY;
      if (glow) glow.style.opacity = "1";
    }, { passive: true });
    const follow = () => {
      gx += (tx - gx) * .12; gy += (ty - gy) * .12;
      if (glow) glow.style.transform = `translate(${gx - 210}px,${gy - 210}px)`;
      requestAnimationFrame(follow);
    };
    follow();

    $$("[data-tilt]").forEach(card => {
      card.addEventListener("pointermove", e => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - .5;
        const y = (e.clientY - r.top) / r.height - .5;
        card.style.transform = `perspective(900px) rotateX(${-y * 4}deg) rotateY(${x * 4}deg) translateY(-5px)`;
      });
      card.addEventListener("pointerleave", () => card.style.transform = "");
    });

    $$(".magnetic").forEach(el => {
      el.addEventListener("pointermove", e => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - (r.left + r.width / 2);
        const y = e.clientY - (r.top + r.height / 2);
        el.style.transform = `translate(${x * .09}px,${y * .09}px)`;
      });
      el.addEventListener("pointerleave", () => el.style.transform = "");
    });
  }

  const canvas = $("#goldCanvas");
  if (canvas && !reduced) {
    const ctx = canvas.getContext("2d");
    let w = 0, h = 0, dpr = 1, particles = [], raf;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(devicePixelRatio || 1, 1.5);
      w = r.width; h = r.height;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.max(18, Math.min(40, Math.round(w / 35)));
      particles = Array.from({ length: count }, (_, i) => ({
        a: (Math.PI * 2 * i) / count + Math.random() * .35,
        r: Math.min(w, h) * (.18 + Math.random() * .46),
        s: .00035 + Math.random() * .00055,
        o: .12 + Math.random() * .43,
        z: .55 + Math.random() * 1.7
      }));
    };
    const draw = t => {
      ctx.clearRect(0, 0, w, h);
      const cx = w * .72, cy = h * .48;
      particles.forEach((p, i) => {
        const a = p.a + t * p.s;
        const squash = .48 + (i % 3) * .055;
        const x = cx + Math.cos(a) * p.r;
        const y = cy + Math.sin(a) * p.r * squash;
        ctx.beginPath();
        ctx.arc(x, y, p.z, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(225,199,127,${p.o})`;
        ctx.fill();
      });
      raf = requestAnimationFrame(draw);
    };
    resize();
    addEventListener("resize", resize, { passive: true });
    raf = requestAnimationFrame(draw);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else raf = requestAnimationFrame(draw);
    });
  }

  const ratesList = $("#ratesList");
  const priceTime = $("#priceTime");
  const priceSource = $("#priceSource");

  const renderPrices = data => {
    if (!ratesList) return;
    const formatter = value => value ? `₺ ${value}` : "—";
    ratesList.innerHTML = data.prices.map((p, i) => `
      <div class="rate-row" style="animation-delay:${i * 45}ms">
        <span class="rate-name">${p.name}</span>
        <span class="rate-value">${formatter(p.buy)}</span>
        <span class="rate-value sell">${formatter(p.sell)}</span>
      </div>
    `).join("");
    const stamp = data.updated || new Intl.DateTimeFormat("tr-TR", { hour:"2-digit", minute:"2-digit" }).format(new Date());
    if (priceTime) priceTime.textContent = `Güncellendi · ${stamp}`;
    if (priceSource) priceSource.textContent = "Kaynak · Altınkaynak";
  };

  const renderPriceError = () => {
    if (!ratesList) return;
    ratesList.innerHTML = `<div class="price-error"><strong>Canlı fiyat servisine şu an ulaşılamıyor.</strong>Eski fiyat göstermemek için değerleri gizledik. <a href="https://www.altinkaynak.com/canli-kurlar/altin" target="_blank" rel="noopener">Altınkaynak’ta kontrol et ↗</a></div>`;
    if (priceTime) priceTime.textContent = "Bağlantı bekleniyor";
    if (priceSource) priceSource.textContent = "Fiyat gösterilmiyor";
  };

  let priceBusy = false;
  const loadPrices = async () => {
    if (priceBusy) return;
    priceBusy = true;
    try {
      const res = await fetch("/api/prices", { cache:"no-store" });
      if (!res.ok) throw new Error("price service unavailable");
      const data = await res.json();
      if (!data?.prices?.length) throw new Error("empty price data");
      renderPrices(data);
    } catch (_) {
      renderPriceError();
    } finally {
      priceBusy = false;
    }
  };
  loadPrices();
  setInterval(() => {
    if (!document.hidden) loadPrices();
  }, 60000);
})();