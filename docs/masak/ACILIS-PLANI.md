# MASAK formunu üretimde açma planı

Bu dosya, formu canlıya alacak oturum (ajan) içindir. Kullanıcı "MASAK formunu aç, ACILIS-PLANI.md'yi uygula" dediğinde
buradan devam edilir. Kullanıcı teknik iş yapmak istemiyor: aşağıdaki **kullanıcı adımları dışındaki her şeyi ajan yapar.**

## Değişmez kurallar

- Gizli değerler (token, anahtar, parola) sohbete, commit'e veya günlüğe **yazılmaz**; kullanıcıdan da sohbete yapıştırması istenmez.
- Üretim Supabase projesi, 22 Ekim'de kurulan **test projesinden ayrıdır**; test projesine üretim verisi girmez.
- `LEGAL_REVIEW_APPROVED=true` yalnızca kullanıcı, aydınlatma metninin avukat/patron tarafından onaylandığını açıkça bildirdikten sonra
  girilir. Ajan bunu kendi kararıyla çevirmez ve kodu değiştirerek atlamaz.
- `MASAK_INTAKE_ENABLED=true` en son adımdır. Geri alma: `MASAK_INTAKE_ENABLED=false` (form hemen kapanır).
- Anahtarlar kaybolursa şifreli başvurular geri alınamaz: üç anahtarı kullanıcıya "kasada sakla" diye bildirmeden açmayın.

## Kullanıcının yapacağı (yalnızca bunlar)

1. Hesap açmak: Supabase, Cloudflare (Turnstile için), Resend. (Vercel hesabı vardır.) Google ile girişle 1–2 dakika.
2. Oturumun ortam ayarlarına şu değişkenleri eklemek (sohbete yazmadan): `VERCEL_TOKEN`, `SUPABASE_ACCESS_TOKEN`,
   `CLOUDFLARE_API_TOKEN` (yalnız Turnstile düzenleme izni), `RESEND_API_KEY`. Yeni oturum bunları görür.
3. Mesajla bildirmek: ticari unvan, vergi no, KEP (varsa), yönetici e-postası, belge/imza yükleme kararı (öneri: kapalı),
   avukat/patron onayı verildiğinde bunu.
4. Yönetici hesabı için telefondaki doğrulayıcı uygulamayla QR'ı taramak (ajan QR'ı görmez/saklamaz).
5. E-posta için GoDaddy'de ajanın vereceği DNS kayıtlarını eklemek **veya** alan adının nameserver'ını Vercel'e çevirmek
   (şu an alan adında MX/TXT kaydı yoktur, bozulacak e-posta yoktur). Sonrasında DNS'i ajan Vercel API'siyle yönetir.

## Ajanın adımları

1. **Durum:** `VERCEL_TOKEN` ile proje ve mevcut production ortam değişkeni *adlarını* listele (değerleri değil). Alan adı:
   ana adres `https://www.alverakuyumculuk.com` (canonical); `APP_URL` bununla aynı olmalı, aksi halde yönetim girişi 403 verir.
2. **Supabase (üretim):** Management API ile yeni proje (bölge kararı: AB/Frankfurt; yurt dışı aktarım avukata sorulmuştur, bkz.
   `HUKUK-DANISMANI-LISTESI.md` madde 6). Güçlü rastgele DB parolası üret, ekrana basma. `supabase/migrations/*` çalıştır
   (`scripts/migrate-supabase.mjs` mantığı, tek transaction + checksum), `scripts/verify-supabase.mjs` ile RLS ve **private**
   bucket'ı doğrula. Genel kayıt (signup) kapat, TOTP MFA aç. Yönetici kullanıcıyı oluştur, `admin_users` kaydını ekle.
3. **Turnstile:** Cloudflare API ile widget; alan adları `www.alverakuyumculuk.com`, `alverakuyumculuk.com`. Site key/secret'ı doğrudan Vercel'e yaz.
4. **Resend:** alan adını ekle, DNS kayıtlarını al; kullanıcı/Vercel DNS ile ekletip doğrula. `EMAIL_FROM` ve `ADMIN_EMAIL` ayarla.
5. **Anahtarlar:** `DATA_ENCRYPTION_KEY`, `TOKEN_SECRET`, `CRON_SECRET` = her biri ayrı `randomBytes(32).toString('base64')`; doğrudan
   Vercel production'a yaz, ekrana basma.
6. **Vercel production ortamı:** `APP_MODE=supabase`, `APP_URL`, `SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY` (service role asla `NEXT_PUBLIC_` değil),
   `TURNSTILE_*`, `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_EMAIL`, `PRIVACY_NOTICE_PATH=./legal/aydinlatma-metni.txt`,
   `PRIVACY_NOTICE_VERSION`, `DATA_CONTROLLER_NAME`, `RETENTION_DAYS` (avukat kararı), `DOCUMENTS_ENABLED`/`SIGNATURE_ENABLED`/
   `RESIDENCE_DOCUMENT_ENABLED` (kullanıcı kararı; kapalıysa antivirüs geçidi gerekmez), `TRUSTED_IP_HEADER` (Vercel'de doğru başlığı doğrula).
7. **Aydınlatma metni:** kullanıcının verdiği unvan/vergi no/KEP/saklama süresi ile `[[DOLDURUN: …]]` işaretlerini doldur,
   `npx vitest run tests/privacy-notice.test.ts` çalıştır, commit et. Doldurulmamış işaret kalırsa üretim başvuru kabul etmez.
8. **Zamanlanmış iş:** `/api/masak/jobs` yalnızca POST kabul eder ve e-posta kuyruğunu (`processOutbox`) bununla boşaltır. Vercel Cron GET
   gönderir ve `CRON_SECRET` tanımlıysa `Authorization: Bearer` başlığını kendisi ekler. Gerekirse route'a GET ekle ve `vercel.json`'a `crons`
   yaz. Vercel belgesine göre (doğrulandı): cron çağrısı GET'tir, `CRON_SECRET` tanımlıysa `Authorization: Bearer <CRON_SECRET>` otomatik eklenir, ücretsiz (Hobby) planda en fazla günde bir kez ve o saat içinde rastgele bir anda çalışır, yönlendirmeleri (3xx) takip etmez, teslimat çift/eksik olabilir (iş idempotent olmalı). Günde bir kez e-postayı saatler geciktireceğinden başvuru anında kuyruğu ayrıca tetikle.
9. **Uçtan uca deneme (üretimde, sentetik):** gerçek kişi verisi kullanma. Başvuru gönder → yönetici e-postası geldi mi → yönetici girişi +
   MFA (kullanıcı QR'ı tarar) → kaydı görüntüle/PDF → sentetik kaydı sil. Hız sınırı, CSRF ve Turnstile reddini dene.
10. **Aç:** kullanıcı onayı bildirdiyse `LEGAL_REVIEW_APPROVED=true`, sonra `MASAK_INTAKE_ENABLED=true`, yeniden dağıt.
    Canlıda: `/masak-form` formu gösteriyor, `/masak-form/privacy` metni gösteriyor, ana sitedeki "MASAK Form" bağlantısı çalışıyor.
11. **Kullanıcıya bildir:** anahtarları kasada saklaması, hangi adreste açıldığı, kapatma yöntemi (`MASAK_INTAKE_ENABLED=false`).
