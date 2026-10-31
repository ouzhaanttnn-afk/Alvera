# ALVERA MASAK RAPORU

Alvera Kuyumculuk için iç uyum kayıt ve denetim hazırlık uygulaması. Mevcut Next.js 16 sitesinin içinde
`/masak-raporu` rotasında çalışır. Ana site (statik `index.html`) ve MASAK müşteri formu (`/masak-form`) değişmeden kalır.
Ana sitenin alt bilgisinde yalnızca küçük bir "MASAK Raporu (personel)" bağlantısı eklendi.

> **Önemli:** Bu uygulama MASAK Online'ın yerine geçmez, resmi bildirim yapmaz ve uyumluluk sertifikası değildir.
> Şüpheli işlem bildirimi yalnızca yetkili kişi tarafından resmi kanaldan yapılır. Kurallar açıklayıcı uyarı üretir;
> nihai değerlendirme insana aittir.

## Mimari

| Katman | Seçim | Neden |
|---|---|---|
| Uygulama | Mevcut Next.js 16 App Router + TypeScript, `/masak-raporu` | Framework değişikliği yok; aynı Vercel projesi. İleride `masak.<alan-adi>` alt alan adına rewrite ile bağlanabilir (bkz. URETIM.md). |
| Veritabanı | Supabase Postgres, ayrı `masak` şeması | Şema PostgREST/Data API'ye açılmaz; anon anahtarla tablo erişimi yoktur. |
| Yetki | Postgres RLS + uygulama kontrolü | Sunucu her kullanıcı sorgusunu `set local role authenticated` ve `request.jwt.claims` ile çalıştırır; tüm politikalar `masak.has_perm(org, izin)` üzerinden kiracı + rol denetler. |
| Kimlik doğrulama | Üretim: Supabase Auth e-posta/parola + TOTP MFA (aal2 zorunlu). Yerel: scrypt parola + RFC 6238 TOTP + sunucu taraflı oturum tablosu | Açık kayıt yok; davetle personel eklenir. |
| Belgeler | Üretim: Supabase Storage özel kova (`masak-raporu-private`); yerel: dosya sistemi | İçerik uygulama katmanında AES-256-GCM ile şifrelenir; depolama anahtarı ayrı tabloda ve yalnızca yetki fonksiyonuyla okunur. |
| Hassas alanlar | TCKN/VKN/belge no AES-256-GCM (alan bağlamı AAD) + işletmeye bağlı HMAC (mükerrer arama) + maskeli gösterim | Görüntüleme yetkisi ayrı izindir ve her açık görüntüleme denetim izine yazılır. |
| Kural motoru | `src/masak-raporu/rules/engine.ts` (saf TS) + `masak.compliance_rules` (tarihli versiyonlar) | İşlem tarihinde yürürlükteki versiyon uygulanır. |
| PDF | pdf-lib + NotoSans (mevcut bağımlılık) | pdfme, pdf-lib üzerine kurulu ve ek arayüz bağımlılıkları getiriyor; tablo, sayfa numarası, uyarı bandı için pdf-lib yeterli. |
| OCR | Tesseract.js 7 (Apache-2.0), yalnızca tarayıcıda | Görüntü sunucuya veya üçüncü tarafa gönderilmez; yalnızca motor ve dil verisi jsDelivr'dan indirilir. |
| ZIP | Bağımlılıksız STORE yazıcı (`src/masak-raporu/zip.ts`) | Manifest + SHA-256 ile bütünlük. |
| Para | Tam kuruş `bigint`, gram `numeric(12,3)` | Kayan nokta yok. |

## Dizinler

```
supabase/migrations/20261031120000_masak_raporu.sql        şema, RLS, tetikleyiciler, fonksiyonlar
supabase/migrations/20261031120100_masak_raporu_rules.sql  tarihli kural kataloğu (koddan üretilir, testle eşitlenir)
src/masak-raporu/                                          iş mantığı (money, dates, mrz, csv, zip, permissions, rules)
src/masak-raporu/server/                                   sunucu katmanı (db, auth, session, müşteri, işlem, rapor...)
src/masak-raporu/ui/                                       panel bileşenleri
src/app/masak-raporu/                                      sayfalar ve sunucu eylemleri
src/app/api/masak-raporu/                                  PDF, CSV, ZIP ve belge rotaları
scripts/masak-raporu-owner.mjs                             üretimde ilk işletme sahibi daveti
tests/masak-raporu/                                        birim + veritabanı/RLS + rapor testleri
tests/e2e/masak-raporu.spec.ts                             Playwright akışları
```

## Yerel kurulum (sentetik demo)

```bash
npm ci
node scripts/setup-local.mjs            # .env.local (APP_MODE=local) oluşturur
npm run dev                             # http://127.0.0.1:3000/masak-raporu
```

İlk açılışta yerel PGlite veritabanı (`.local/masak-raporu/pgdata`) kurulur ve **DEMO etiketli sentetik** veri oluşur:
iki işletme (Alvera DEMO ve B DEMO), beş rol için kullanıcı, müşteriler, eşik üstü/altı işlemler, onaylı bağlantı grubu,
iptal ve düzeltme kaydı, bir iç değerlendirme. Giriş bilgileri `.local/masak-raporu-demo-giris.txt` dosyasına yazılır
(parola ve TOTP anahtarı; doğrulayıcı uygulamaya ekleyin). Sabit değer isterseniz `.env.local` içine
`MASAK_RAPORU_DEMO_PASSWORD` ve `MASAK_RAPORU_DEMO_TOTP_SECRET` girin. Demo kimlik numaraları 999 ile başlar ve gerçek kişiye ait değildir.

| Demo kullanıcı | Rol |
|---|---|
| sahip@alvera-demo.test | İşletme Sahibi |
| yonetici@alvera-demo.test | Yönetici |
| uyum@alvera-demo.test | Uyum Yetkilisi |
| personel@alvera-demo.test | Personel |
| denetci@alvera-demo.test | Salt Okunur Denetçi |
| sahip@ornek-b-demo.test | B işletmesi sahibi (izolasyon testi) |

## Testler

```bash
npm run typecheck
npx vitest run                          # birim + veritabanı/RLS + rapor (PGlite, sentetik)
npx playwright test tests/e2e/masak-raporu.spec.ts
npm run build
```

Projede ESLint yapılandırılmamış; `lint` komutu yoktur. Tip kontrolü ve üretim derlemesi kalite kapısı olarak kullanılır.
Sonuçlar: [TEST-SONUCLARI.md](TEST-SONUCLARI.md).

## Roller

| İzin | Sahip | Yönetici | Uyum Yetkilisi | Personel | Denetçi |
|---|---|---|---|---|---|
| Kayıt görüntüleme / ekleme | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ | ✓/— |
| Hassas bilgiyi açık görme* | ✓ | ✓ | ✓ | — | — |
| Belge indirme* / yükleme | ✓/✓ | ✓/✓ | ✓/✓ | —/✓ | —/— |
| Rapor & dışa aktarma* | ✓ | ✓ | ✓ | — | ✓ |
| Gizli raporlar (ŞİB) | ✓ | — | ✓ | — | — |
| İç şüphe bildirimi / görme / yönetme | ✓/✓/✓ | ✓/—/— | ✓/✓/✓ | ✓/—/— | — |
| Bağlantı kararı, uyarı değerlendirme | ✓ | ✓ | ✓ | — | — |
| Kural taslağı / onayı | ✓/✓ | ✓/— | ✓/✓ | — | — |
| Personel, ayarlar | ✓ | ✓ | — | — | — |
| Denetim izi | ✓ | ✓ | ✓ | — | ✓ |

\* Kişi bazında ek verilebilir veya geri alınabilir. Matris `src/masak-raporu/permissions.ts` ve `masak.role_permissions()` içindedir; eşitliği test edilir.

Diğer belgeler: [MEVZUAT.md](MEVZUAT.md) · [GUVENLIK-KVKK.md](GUVENLIK-KVKK.md) · [URETIM.md](URETIM.md) · [LISANSLAR.md](LISANSLAR.md)
