(() => {
  'use strict';
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let catalog, filter='all', query='', dialog, activeProduct, lastFocus;
  const gallery=document.querySelector('.gallery');
  const arrow='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>';
  const wa=(message)=>'https://wa.me/'+(catalog?.settings.whatsapp||'905334853040')+'?text='+encodeURIComponent(message);
  function applySettings(s) {
    document.querySelectorAll('a[href^="tel:"]').forEach(a=>{a.href='tel:+'+s.phone.replace(/\D/g,'').replace(/^0/,'90');if(a.closest('.visit-actions'))a.textContent=s.phone;});
    document.querySelectorAll('a[href^="https://wa.me/"]').forEach(a=>{a.href='https://wa.me/'+s.whatsapp;});
    document.querySelectorAll('a[href*="google.com/maps"],a[href*="maps.app.goo.gl"]').forEach(a=>{a.href=s.mapsUrl;});
    const address=document.querySelector('.address-link');if(address)address.textContent=s.address;
    document.querySelectorAll('a[href*="instagram.com/"]').forEach(a=>{a.href='https://www.instagram.com/'+s.instagram+'/';if(a.closest('.footer-top'))a.textContent='@'+s.instagram;});
    const hero=document.querySelector('.hero-description');if(hero)hero.textContent=s.heroSubtitle;
    const intro=document.querySelector('.intro .body-copy');if(intro)intro.textContent=s.introText;
    const answer=document.querySelector('.visitor-question-list details:last-child .visitor-answer p');if(answer)answer.textContent=s.address+' adresindeyiz. '+(s.hours?'Çalışma saatlerimiz: '+s.hours:'Gelmeden önce çalışma saatlerini öğrenmek için bizi arayabilirsiniz.');
    const visit=document.querySelector('.visit-copy');if(s.hours&&visit){const hours=document.createElement('p');hours.className='store-hours';hours.textContent='Çalışma saatleri · '+s.hours;visit.append(hours);}
    const note=document.querySelector('.visit-note p');if(note){note.replaceChildren();if(s.googleRating){const strong=document.createElement('strong');strong.textContent=s.googleRating+' / 5';note.append('Google Haritalar’da ',strong,s.googleReviewCount?' · '+s.googleReviewCount+' yorum':'');}else note.textContent='Mağazamızı Google Haritalar’da bulabilir, müşteri yorumlarına göz atabilirsiniz.';}
    const store=catalog.media.find(m=>m.id===s.storeImage);if(store&&visit){const image=document.createElement('img');image.src=store.url;image.alt='Alvera Kuyumculuk mağazası';image.className='store-photo';image.loading='lazy';image.width=store.width;image.height=store.height;visit.append(image);}
    const canonical=document.querySelector('link[rel=canonical]');if(canonical)canonical.href=s.siteUrl+'/';
    let schema=document.querySelector('#store-schema');if(!schema){schema=document.createElement('script');schema.type='application/ld+json';schema.id='store-schema';document.head.append(schema);}
    schema.textContent=JSON.stringify({'@context':'https://schema.org','@type':'JewelryStore',name:'Alvera Kuyumculuk',url:s.siteUrl,telephone:s.phone,address:{'@type':'PostalAddress',streetAddress:s.address,addressLocality:'Ankara',addressCountry:'TR'},logo:s.siteUrl+'/assets/alvera-logo.png',sameAs:['https://www.instagram.com/'+s.instagram+'/'],hasMap:s.mapsUrl});
    const select=document.querySelector('#visitor-category');const link=document.querySelector('#visitor-request-link');
    if(select&&link){const update=()=>{const option=select.options[select.selectedIndex];link.href=wa('Merhaba, '+(select.value?option.textContent+' seçenekleri':'mağazanızdaki modeller')+' hakkında bilgi almak istiyorum.');};select.addEventListener('change',update);update();}
  }
  function categoryNavigation() {
    let representative = false;
    document.querySelectorAll('[data-category-tile]').forEach(tile => {
      const key = tile.dataset.categoryTile;
      const label = tile.dataset.categoryLabel;
      const product = catalog.products.find(p => p.category === key && p.images.length);
      const photo = product && catalog.media.find(m => m.id === product.images[0]);
      if (photo) {
        const image = tile.querySelector('img');
        image.src = photo.url;
        image.alt = product.name;
        tile.querySelector('.category-action').textContent = 'Modelleri incele';
        tile.href = '#koleksiyon';
        tile.removeAttribute('target');
        tile.removeAttribute('rel');
        tile.addEventListener('click', event => {
          event.preventDefault();
          filter = key;
          query = '';
          const tools = document.querySelector('.catalog-tools');
          tools.querySelector('input').value = '';
          tools.querySelectorAll('[data-category]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.category === key)));
          document.querySelectorAll('[data-category-tile]').forEach(item => {
            if (item === tile) item.setAttribute('aria-current', 'true');
            else item.removeAttribute('aria-current');
          });
          render();
          tools.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
        });
      } else {
        representative = true;
        tile.href = wa('Merhaba, ' + label + ' modelleri hakkında bilgi almak istiyorum.');
      }
    });
    const note = document.querySelector('.category-photo-note');
    if (note) note.hidden = !representative;
  }
  function render() {
    const products=catalog.products.filter(p=>(filter==='all'||p.category===filter)&&(!query||(p.name+' '+p.description+' '+p.metal+' '+p.sku).toLocaleLowerCase('tr-TR').includes(query)));
    gallery.classList.add('has-products');
    gallery.innerHTML=products.map(p=>{const photo=catalog.media.find(m=>m.id===p.images[0]);return `<a href="?urun=${p.id}#koleksiyon" class="gallery-card is-visible" data-product="${p.id}" aria-label="${escape(p.name)} detaylarını aç"><span class="gallery-image"><img src="${escape(photo?.url)}" alt="${escape(p.name)}" width="${photo?.width||800}" height="${photo?.height||1000}" loading="lazy" decoding="async" /></span><span class="card-details"><span>${escape(catalog.categories[p.category])}${p.sku?' / '+escape(p.sku):''}</span><strong>${escape(p.name)}</strong>${p.metal?'<small>'+escape(p.metal)+'</small>':''}</span></a>`;}).join('')||(query||filter!=='all'?'<p class="catalog-empty">Bu aramada ürün bulunamadı. Başka bir kategoriye göz atın.</p>':'');
    document.querySelector('.catalog-count').textContent=products.length+' parça';
    document.body.classList.remove('gallery-focused');
  }
  function createTools() {
    const tools=document.createElement('div');tools.className='catalog-tools';tools.innerHTML='<div class="catalog-filters" aria-label="Ürün kategorileri"><button type="button" data-category="all" aria-pressed="true">Tümü</button>'+Object.entries(catalog.categories).filter(([key])=>catalog.products.some(p=>p.category===key)).map(([key,label])=>`<button type="button" data-category="${key}" aria-pressed="false">${escape(label)}</button>`).join('')+'</div><label><span class="sr-only">Seçkide ürün ara</span><input type="search" class="catalog-search" placeholder="Seçkide ara" aria-label="Seçkide ürün ara" /></label>';
    gallery.before(tools);const count=document.createElement('p');count.className='catalog-count';count.setAttribute('role','status');count.setAttribute('aria-live','polite');gallery.after(count);
    tools.addEventListener('click',event=>{const button=event.target.closest('[data-category]');if(!button)return;filter=button.dataset.category;document.querySelectorAll('[data-category-tile]').forEach(tile=>{if(tile.dataset.categoryTile===filter)tile.setAttribute('aria-current','true');else tile.removeAttribute('aria-current');});tools.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));render();});
    tools.querySelector('input').addEventListener('input',event=>{query=event.target.value.trim().toLocaleLowerCase('tr-TR');render();});
    gallery.addEventListener('click',event=>{const card=event.target.closest('[data-product]');if(!card)return;event.preventDefault();showProduct(card.dataset.product,true);});
    gallery.addEventListener('pointerover',event=>{if(!matchMedia('(hover:hover)').matches)return;const card=event.target.closest('.gallery-card');if(!card)return;gallery.querySelectorAll('.is-active').forEach(c=>c.classList.remove('is-active'));card.classList.add('is-active');document.body.classList.add('gallery-focused');});
    gallery.addEventListener('pointerleave',()=>{document.body.classList.remove('gallery-focused');gallery.querySelectorAll('.is-active').forEach(c=>c.classList.remove('is-active'));});
  }
  function ensureDialog() {
    if(dialog)return;dialog=document.createElement('dialog');dialog.className='product-dialog';dialog.setAttribute('aria-labelledby','product-dialog-title');dialog.innerHTML='<header class="product-dialog-header"><img src="/assets/alvera-logo.png" alt="Alvera Kuyumculuk" width="1010" height="360" /><button type="button" class="product-dialog-close" aria-label="Ürün detayını kapat">×</button></header><div class="product-dialog-content"></div>';document.body.append(dialog);
    dialog.querySelector('.product-dialog-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',event=>{if(event.target===dialog){const bounds=dialog.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)dialog.close();}});
    dialog.addEventListener('close',()=>{document.body.classList.remove('product-dialog-open','gallery-focused');const url=new URL(location.href);url.searchParams.delete('urun');history.replaceState({},'',url);lastFocus?.focus({preventScroll:true});});
  }
  function showProduct(id, push) {
    const p=catalog.products.find(p=>p.id===id);if(!p)return;ensureDialog();activeProduct=p;lastFocus=document.activeElement;
    const photos=p.images.map(id=>catalog.media.find(m=>m.id===id)).filter(Boolean);const url=catalog.settings.siteUrl+'/?urun='+p.id+'#koleksiyon';
    dialog.querySelector('.product-dialog-content').innerHTML=`<div class="product-dialog-grid"><div class="product-photo-area"><img class="product-main-photo" src="${escape(photos[0]?.url)}" alt="${escape(p.name)}" /><div class="product-thumbnails">${photos.length>1?photos.map((m,index)=>`<button type="button" data-image="${index}" aria-label="${index+1}. fotoğrafı göster" aria-pressed="${index===0}"><img src="${escape(m.url)}" alt="" /></button>`).join(''):''}</div></div><div class="product-dialog-copy"><p class="eyebrow">${escape(catalog.categories[p.category])}${p.sku?' / '+escape(p.sku):''}</p><h2 id="product-dialog-title">${escape(p.name)}</h2>${p.metal?'<p class="product-metal">'+escape(p.metal)+'</p>':''}${p.description?'<p class="product-description">'+escape(p.description)+'</p>':''}<a class="product-enquiry" href="${escape(wa('Merhaba, '+p.name+(p.sku?' ('+p.sku+')':'')+' hakkında bilgi almak istiyorum. '+url))}" target="_blank" rel="noopener noreferrer">Bu ürünü mağazaya sor ${arrow}</a><p class="product-price-note">Güncel fiyat ve mağazadaki seçenekler için bize yazın. Bu işlem sipariş oluşturmaz.</p><button type="button" class="product-share">Ürün bağlantısını paylaş</button><span class="product-share-status" role="status"></span></div></div>`;
    dialog.querySelectorAll('[data-image]').forEach(b=>b.addEventListener('click',()=>{dialog.querySelector('.product-main-photo').src=photos[+b.dataset.image].url;dialog.querySelectorAll('[data-image]').forEach(item=>item.setAttribute('aria-pressed',String(item===b)));}));
    dialog.querySelector('.product-share').addEventListener('click',async()=>{try{if(navigator.share)await navigator.share({title:p.name,url});else{await navigator.clipboard.writeText(url);dialog.querySelector('.product-share-status').textContent='Bağlantı kopyalandı.';}}catch(error){if(error.name!=='AbortError')dialog.querySelector('.product-share-status').textContent='Adres çubuğundaki bağlantıyı paylaşabilirsiniz.';}});
    if(push){const path=new URL(location.href);path.searchParams.set('urun',p.id);path.hash='koleksiyon';history.pushState({},'',path);}
    document.body.classList.add('product-dialog-open');document.body.classList.remove('gallery-focused');if(!dialog.open)dialog.showModal();
  }
  window.addEventListener('popstate',()=>{const id=new URL(location.href).searchParams.get('urun');if(id&&catalog)showProduct(id,false);else if(dialog?.open)dialog.close();});
  fetch('/api/catalog',{signal:AbortSignal.timeout(10000)}).then(response=>{if(!response.ok)throw new Error();return response.json();}).then(value=>{catalog=value;applySettings(value.settings);if(value.products.length){createTools();render();const id=new URL(location.href).searchParams.get('urun');if(id)showProduct(id,false);} categoryNavigation(); }).catch(()=>{/* Keep the original site and prices available if the catalog is offline. */});
})();
