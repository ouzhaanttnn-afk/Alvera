# Üretime alma, Vercel preview ve domain planı

## Vercel preview (şimdi yapılabilir)

`feature/masak-raporu` dalı GitHub'a gönderildiğinde Vercel (proje GitHub'a bağlıysa) otomatik **Preview** dağıtımı oluşturur.
Preview'da gerekli ortam değişkenleri yoksa `/masak-raporu` güvenli şekilde **kapalı** sayfası gösterir (fail-closed); ana site ve
MASAK formu etkilenmez. Panelin preview'da çalışması için ayrı bir **test Supabase projesi** (yalnızca sentetik veri) gerekir:

1. Supabase'te yeni proje (AB bölgesi önerilir; KVKK md. 9 değerlendirmesi bkz. GUVENLIK-KVKK.md).
2. SQL Editor'da sırayla: `20261031120000_masak_raporu.sql`, `20261031120100_masak_raporu_rules.sql`.
3. Storage → yeni kova `masak-raporu-private`, **Public: kapalı**, dosya sınırı 11 MB.
4. Auth → "Allow new users to sign up" **kapalı**; MFA → TOTP **açık**.
5. Vercel → Settings → Environment Variables (yalnızca **Preview** ortamına):
   `MASAK_RAPORU_ENABLED=true`, `MASAK_DATABASE_URL` (Supavisor transaction pooler, port 6543, `sslmode=require`),
   `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATA_ENCRYPTION_KEY`, `TOKEN_SECRET` (her biri
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`), `APP_URL=https://<preview-adresi>`, `TRUSTED_IP_HEADER=x-real-ip`.
6. İlk sahip daveti: `MASAK_DATABASE_URL=... APP_URL=... node scripts/masak-raporu-owner.mjs "Alvera Kuyumculuk (TEST)" sizin@eposta`
7. Bağlantıyı açın, hesabı oluşturun, doğrulayıcıyı eşleyin; diğer personeli panelden davet edin.

> Not: Supabase Auth, MFA ve Storage yolları bu ortamda gerçek bir Supabase projesine karşı **çalıştırılamadı** (anahtar yok).
> Yerel testler aynı SQL'i gerçek PostgreSQL (PGlite) üzerinde, yerel kimlik doğrulama adaptörüyle doğrular. Preview'da ilk iş
> olarak giriş, MFA, belge yükleme/indirme ve rapor akışlarını sentetik veriyle deneyin.

## Üretime alma kontrol listesi

- [ ] GUVENLIK-KVKK.md "Yapılacaklar" maddeleri tamamlandı (hukuk onayı, yurt dışı aktarım, VERBİS, sızma testi).
- [ ] Üretim Supabase projesi ayrı; preview ile veri/anahtar paylaşılmıyor.
- [ ] Migration'lar uygulandı; `select count(*) from masak.compliance_rules` = 20; `masak` şeması Data API'de **yok**.
- [ ] Ortam değişkenleri yalnızca **Production** ortamında; `APP_MODE` tanımsız veya `production`; `MASAK_RAPORU_DEMO_*` tanımsız.
- [ ] `npm run typecheck`, `npx vitest run`, `npm run build` yeşil.
- [ ] Storage kovası private; servis rol anahtarı yalnızca sunucuda.
- [ ] İlk sahip daveti betikle oluşturuldu; sahip MFA'yı etkinleştirdi; kendi denetim izi kontrol edildi.
- [ ] Saklama politikaları hukuk onayıyla işaretlendi.
- [ ] Yedekleme (PITR) açık ve bir geri yükleme tatbikatı yapıldı.
- [ ] İzleme/hata takibi eklenecekse kişisel veri göndermeyecek şekilde yapılandırıldı.
- [ ] Ana sitedeki "MASAK Raporu (personel)" bağlantısının görünürlüğü işletmece onaylandı.

## Yedekleme ve geri yükleme

- **Veritabanı:** Supabase PITR (Pro plan) veya günlük `pg_dump --schema=masak` → şifreli, erişimi kısıtlı depo. Geri yükleme önce ayrı bir projeye yapılıp doğrulanır.
- **Belgeler:** Storage kovası ayrıca yedeklenir; içerik zaten şifrelidir, **anahtar olmadan yedek okunamaz**.
- **Anahtarlar:** `DATA_ENCRYPTION_KEY`, `TOKEN_SECRET` çevrimdışı ve iki ayrı yetkilide saklanır.
- **Doğrulama:** Geri yükleme sonrası Ayarlar → "Denetim izi bütünlüğü" kontrolü (hash zinciri) ve örnek belge indirme (SHA-256 kontrolü otomatik).
- **Silme:** Süresi dolan kayıtlar otomatik silinmez; panelde silme değerlendirme talebi açılır. Yasal saklama/istisna (inceleme, dava, denetim) kontrolünden sonra yetkili kişi karar verir. Kalıcı imha betiği hukuk onayından sonra yazılmalıdır.

## Domain / alt alan adı

Gerçek alan adı varsayılmadı. Bugün: `https://<alan-adi>/masak-raporu`. İleride `masak.<alan-adi>` istenirse:
1. Vercel → Domains → `masak.<alan-adi>` ekleyin (aynı proje).
2. `next.config.ts` → `rewrites` içine host koşullu kural: `{ source: '/:path*', has: [{ type: 'host', value: 'masak.<alan-adi>' }], destination: '/masak-raporu/:path*' }` ve API için ayrı kural.
3. `APP_URL` ve Supabase Auth "Site URL / Redirect URLs" güncellenir. Çerezler host'a bağlı olduğundan ana siteyle paylaşılmaz.
Mevcut domaine dokunulmadı.

## Muhasebe entegrasyonu

Şu an yalnızca CSV içe aktarma vardır (kolon eşleme, önizleme, doğrulama, mükerrer kontrolü, hata raporu). Belirli bir muhasebe programının
gerçek API'si bilinmediği için adaptör uydurulmadı. Eklenecek adaptör, `previewImport/commitImport` ile aynı doğrulama yolunu
kullanmalı ve işlemleri `import_batch` ile işaretlemelidir.
