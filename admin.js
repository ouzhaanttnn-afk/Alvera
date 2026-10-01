(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const names = {yuzuk:'Yüzük',kolye:'Kolye',kupe:'Küpe',bileklik:'Bileklik',bilezik:'Bilezik',hediye:'Hediye',ozel:'Özel seçki'};
  let csrf = '', data = null, photos = [], editing = false, dirty = false, pendingBackup = null, uploading = false, noticeTimer;
  function notice(message, error = false) { const box = $('#notice'); box.textContent = message; box.classList.toggle('error', error); box.hidden = false; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { box.hidden = true; }, error ? 10000 : 5000); }
  async function api(action, body) {
    const response = await fetch('/api/manage?action=' + action, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', headers: body === undefined ? {} : {'Content-Type':'application/json','X-CSRF-Token':csrf}, ...(body === undefined ? {} : {body:JSON.stringify(body)}), signal: AbortSignal.timeout(30000) });
    const result = await response.json();
    if (!response.ok) { if (response.status === 401 && action !== 'login') showLogin(); throw new Error(result.error || 'İşlem tamamlanamadı.'); }
    return result;
  }
  function showLogin() { $('#workspace').hidden = true; $('#login-screen').hidden = false; csrf = ''; }
  function setData(result) { data = result; renderProducts(); renderMedia(); $('#save-state').textContent = 'Kaydedildi · ' + (data.updatedAt ? new Date(data.updatedAt).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}) : 'Kalıcı depolama bağlı'); }
  async function start(active) { csrf = active.csrf; data = await api('catalog'); $('#login-screen').hidden = true; $('#workspace').hidden = false; $('#environment-note').textContent = active.environment === 'preview' ? 'Önizleme · ayrı katalog' : active.environment === 'local' ? 'Yerel geliştirme · ayrı katalog' : 'Canlı mağaza'; setData(data); fillSettings(); }
  function view(name) {
    if (dirty && !confirm('Kaydedilmemiş mağaza bilgileri var. Bu değişikliklerden vazgeçmek istiyor musunuz?')) return;
    dirty = false;
    document.querySelectorAll('.view').forEach(el => { el.hidden = el.id !== 'view-' + name; });
    document.querySelectorAll('[data-view]').forEach(el => { if (el.dataset.view === name) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current'); });
    $('#view-kicker').textContent = {products:'SEÇKİ',media:'FOTOĞRAFLAR',settings:'MAĞAZA BİLGİLERİ',security:'GÜVENLİK VE YEDEK'}[name];
    if (name === 'settings') fillSettings();
  }
  function renderProducts() {
    const all = data.products.filter(p => !p.archived), live = all.filter(p => p.visible);
    $('#stat-total').textContent = all.length; $('#nav-count').textContent = all.length; $('#stat-live').textContent = live.length; $('#stat-draft').textContent = all.length - live.length; $('#stat-media').textContent = data.media.length;
    const search = $('#product-search').value.toLocaleLowerCase('tr-TR'), status = $('#product-status').value;
    const products = data.products.filter(p => (status === 'archive' ? p.archived : !p.archived) && (status !== 'live' || p.visible) && (status !== 'draft' || !p.visible) && (p.name + ' ' + p.sku).toLocaleLowerCase('tr-TR').includes(search)).sort((a,b) => a.order-b.order);
    $('#products-empty').hidden = data.products.length > 0;
    $('#product-list').innerHTML = products.map(p => {
      const photo = data.media.find(m => m.id === p.images[0]);
      return `<article class="product-row" data-id="${p.id}"><img class="product-thumb" src="${escape(photo?.url || '/assets/alvera-monogram.svg')}" alt="${escape(p.name)}" loading="lazy" /><div class="product-info"><strong>${escape(p.name)}</strong><small>${names[p.category]}${p.sku ? ' · ' + escape(p.sku) : ''}</small><span class="badge ${p.archived?'archive':p.visible?'':'draft'}">${p.archived?'Arşiv':p.visible?'Yayında':'Taslak'}</span></div><div class="product-actions"><button data-edit="${p.id}">Düzenle</button><button data-archive="${p.id}">${p.archived?'Geri al':'Arşivle'}</button>${p.archived?'':`<button class="move" data-move="${p.id}" data-direction="-1" aria-label="${escape(p.name)} ürününü yukarı taşı">↑</button><button class="move" data-move="${p.id}" data-direction="1" aria-label="${escape(p.name)} ürününü aşağı taşı">↓</button>`}</div></article>`;
    }).join('');
    if (!products.length && data.products.length) $('#product-list').innerHTML = '<p class="empty-copy">Bu aramada ürün bulunamadı.</p>';
  }
  function renderMedia() {
    $('#media-empty').hidden = data.media.length > 0;
    $('#media-list').innerHTML = data.media.slice().reverse().map(m => `<article class="media-tile"><img src="${escape(m.url)}" alt="${escape(m.name)}" loading="lazy" /><p>${escape(m.name || 'Fotoğraf')}</p><small>${m.width} × ${m.height}</small></article>`).join('');
  }
  function fillSettings() { const form = $('#settings-form'); for (const [key,value] of Object.entries(data.settings)) if (form.elements[key]) form.elements[key].value = value; const select = $('#store-image-select'); select.innerHTML = '<option value="">Fotoğraf gösterme</option>' + data.media.map(m => `<option value="${m.id}">${escape(m.name || 'Fotoğraf')}</option>`).join(''); select.value = data.settings.storeImage; }
  function openEditor(product) {
    const form = $('#product-form'); form.reset(); photos = [...(product?.images || [])];
    for (const key of ['id','name','category','sku','metal','description']) if (product) form.elements[key].value = product[key] || '';
    form.elements.visible.checked = !!product?.visible;
    $('#editor-title').textContent = product ? 'Ürünü düzenle' : 'Yeni ürün'; $('#editor-error').textContent = ''; editing = false; renderPhotos(); $('#product-editor').showModal();
  }
  function closeEditor() { if (uploading) { notice('Fotoğraf yüklemesinin bitmesini bekleyin.'); return; } if (editing && !confirm('Kaydetmeden kapatılsın mı?')) return; $('#product-editor').close(); editing = false; }
  function renderPhotos() {
    $('#selected-photos').innerHTML = photos.map((id,index) => { const photo=data.media.find(m=>m.id===id); return `<div class="selected-photo"><img src="${escape(photo.url)}" alt="${escape(photo.name)}" /><small>${index===0?'Kapak':'Fotoğraf '+(index+1)}</small><div><button type="button" data-photo-move="${index}" data-direction="-1" aria-label="Fotoğrafı önceye taşı">←</button><button type="button" data-photo-move="${index}" data-direction="1" aria-label="Fotoğrafı sonraya taşı">→</button><button type="button" data-photo-remove="${index}" aria-label="Fotoğrafı üründen kaldır">×</button></div></div>`; }).join('');
    $('#photo-picker').innerHTML = data.media.slice().reverse().map(m=>`<button type="button" class="media-tile" data-photo-select="${m.id}" aria-pressed="${photos.includes(m.id)}" aria-label="${escape(m.name || 'Fotoğraf')} seç"><img src="${escape(m.url)}" alt="" loading="lazy" /><p>${escape(m.name || 'Fotoğraf')}</p></button>`).join('');
  }
  async function optimize(file) {
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('JPEG, PNG veya WebP seçin. HEIC için JPEG olarak dışa aktarın.');
    if (file.size > 25000000) throw new Error('Orijinal fotoğraf 25 MB sınırını aşıyor.');
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas'); canvas.width=Math.round(bitmap.width*scale); canvas.height=Math.round(bitmap.height*scale); canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height); bitmap.close();
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.86));
    if (!blob || blob.size>2100000) throw new Error('Fotoğraf küçültülemedi. Daha küçük bir görsel deneyin.');
    const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob);});
    return {data:base64,name:file.name,width:canvas.width,height:canvas.height};
  }
  async function upload(input, addToProduct) {
    if (uploading) return;
    uploading=true; const files=[...input.files].slice(0,addToProduct ? 8-photos.length : 20);
    if (!files.length) { uploading=false; input.value=''; return; }
    document.querySelectorAll('#product-form button[type=submit]').forEach(b=>{b.disabled=true;});
    try {
      for(let i=0;i<files.length;i++) {
        notice(`Fotoğraf yükleniyor · ${i+1}/${files.length}`);
        const result=await api('upload',await optimize(files[i])); data.media.push(result.photo); data.revision=result.revision;
        if(addToProduct){photos.push(result.photo.id);editing=true;renderPhotos();}
      }
      renderMedia(); renderProducts(); notice(files.length+' fotoğraf yüklendi.');
    } catch(error){notice(error.message,true);} finally {uploading=false;input.value='';document.querySelectorAll('#product-form button[type=submit]').forEach(b=>{b.disabled=false;});}
  }
  $('#login-form').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget, button=form.querySelector('button');button.disabled=true;$('#login-error').textContent='';try{const active=await api('login',Object.fromEntries(new FormData(form)));form.elements.password.value='';await start(active);}catch(error){$('#login-error').textContent=error.message;}finally{button.disabled=false;}});
  document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>view(button.dataset.view)));
  $('#logout').addEventListener('click',async()=>{try{await api('logout',{});showLogin();}catch(error){notice(error.message,true);}});
  $('#refresh').addEventListener('click',async()=>{if(dirty||editing){notice('Önce değişikliklerinizi kaydedin veya kapatın.');return;}try{setData(await api('catalog'));fillSettings();notice('Veriler yenilendi.');}catch(error){notice(error.message,true);}});
  $('#new-product').addEventListener('click',()=>openEditor());document.querySelectorAll('[data-new-product]').forEach(b=>b.addEventListener('click',()=>openEditor()));
  $('#product-search').addEventListener('input',renderProducts);$('#product-status').addEventListener('change',renderProducts);
  $('#product-list').addEventListener('click',async event=>{const b=event.target.closest('button');if(!b)return;try{
    if(b.dataset.edit)return openEditor(data.products.find(p=>p.id===b.dataset.edit));
    if(b.dataset.archive){const p=data.products.find(p=>p.id===b.dataset.archive);setData(await api(p.archived?'restore':'archive',{revision:data.revision,id:p.id}));notice(p.archived?'Ürün taslağa geri alındı.':'Ürün arşivlendi. İstediğiniz zaman geri alabilirsiniz.');}
    if(b.dataset.move){const ids=data.products.slice().sort((a,b)=>a.order-b.order).map(p=>p.id),i=ids.indexOf(b.dataset.move),j=i+Number(b.dataset.direction);if(j<0||j>=ids.length)return;[ids[i],ids[j]]=[ids[j],ids[i]];setData(await api('order',{revision:data.revision,ids}));notice('Ürün sırası kaydedildi.');}
  }catch(error){notice(error.message,true);}});
  $('#product-form').addEventListener('input',()=>{editing=true;});
  for(const id of ['editor-close','editor-cancel'])$('#'+id).addEventListener('click',closeEditor);
  $('#product-editor').addEventListener('cancel',event=>{event.preventDefault();closeEditor();});
  $('#product-form').addEventListener('submit',async event=>{event.preventDefault();if(uploading)return;const form=event.currentTarget,button=form.querySelector('button[type=submit]');button.disabled=true;$('#editor-error').textContent='';try{const product=Object.fromEntries(new FormData(form));product.images=photos;product.visible=form.elements.visible.checked;setData(await api('save',{revision:data.revision,product}));editing=false;$('#product-editor').close();notice(product.visible?'Ürün yayımlandı. Sitede yaklaşık 1 dakika içinde görünür.':'Ürün taslak olarak kaydedildi.');}catch(error){$('#editor-error').textContent=error.message;}finally{button.disabled=false;}});
  $('#product-editor').addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;
    if(b.dataset.photoSelect){const id=b.dataset.photoSelect;if(photos.includes(id))photos=photos.filter(p=>p!==id);else if(photos.length<8)photos.push(id);else return notice('En fazla 8 fotoğraf seçebilirsiniz.');editing=true;renderPhotos();}
    if(b.dataset.photoRemove!==undefined){photos.splice(+b.dataset.photoRemove,1);editing=true;renderPhotos();}
    if(b.dataset.photoMove!==undefined){const i=+b.dataset.photoMove,j=i+Number(b.dataset.direction);if(j<0||j>=photos.length)return;[photos[i],photos[j]]=[photos[j],photos[i]];editing=true;renderPhotos();}
  });
  $('#media-upload').addEventListener('change',event=>upload(event.target,false));$('#product-upload').addEventListener('change',event=>upload(event.target,true));
  $('#settings-form').addEventListener('input',()=>{dirty=true;});
  $('#settings-form').addEventListener('submit',async event=>{event.preventDefault();const button=event.currentTarget.querySelector('button[type=submit]');button.disabled=true;try{setData(await api('settings',{revision:data.revision,settings:Object.fromEntries(new FormData(event.currentTarget))}));dirty=false;notice('Mağaza bilgileri kaydedildi. Site 1 dakika içinde güncellenir.');}catch(error){notice(error.message,true);}finally{button.disabled=false;}});
  $('#password-form').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget,body=Object.fromEntries(new FormData(form));if(body.password!==body.confirmPassword)return notice('Yeni şifreler aynı değil.',true);const button=form.querySelector('button');button.disabled=true;try{await api('password',body);form.reset();showLogin();notice('Şifre değişti. Yeni şifrenizle giriş yapın.');}catch(error){notice(error.message,true);}finally{button.disabled=false;}});
  $('#backup-import').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>2000000)throw new Error('Yedek dosyası çok büyük.');const backup=JSON.parse(await file.text());if(backup.schema!==1||!Array.isArray(backup.products)||!Array.isArray(backup.media))throw new Error('Geçerli bir Alvera yedeği seçin.');pendingBackup=backup;$('#import-summary').textContent=`${backup.products.length} ürün ve ${backup.media.length} fotoğraf bağlantısı mevcut kataloğun yerini alacak.`;$('#import-preview').hidden=false;}catch(error){notice(error.message,true);}finally{event.target.value='';}});
  $('#import-cancel').addEventListener('click',()=>{pendingBackup=null;$('#import-preview').hidden=true;});
  $('#import-apply').addEventListener('click',async()=>{if(!pendingBackup)return;try{setData(await api('import',{revision:data.revision,backup:pendingBackup}));pendingBackup=null;$('#import-preview').hidden=true;fillSettings();notice('Yedek geri yüklendi.');}catch(error){notice(error.message,true);}});
  window.addEventListener('beforeunload',event=>{if(dirty||editing||uploading){event.preventDefault();event.returnValue='';}});
  api('session').then(start).catch(error=>{if(!error.message.includes('giriş'))$('#login-error').textContent=error.message.includes('Oturumunuz')?'':error.message;});
})();
