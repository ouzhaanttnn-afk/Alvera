# Test ve teslim raporu — 21 Ekim 2026

## 23 Ekim — MFA QR görseli

Kullanıcının QR görünmüyor bildirimi incelendi. Yüklü `@supabase/auth-js` enrollment yanıtındaki `totp.qr_code` alanını zaten `data:image/svg+xml;utf-8,...` olarak dönüştürüyor. Login bileşeninin bu adresi tekrar SVG URI'ye sarması görseli bozuyordu. `img.src` artık SDK'nın hazır adresini kullanır. Önceki yalnız API düzeyindeki MFA testi bu görsel hatasını yakalamamıştı.

SDK biçimini kullanan sentetik görsel için masaüstü ve Pixel 7 regresyon testi **2/2** geçti; görselin visible ve naturalWidth > 0 olması doğrulandı. Strict TypeScript ve production build başarılı. `scripts/verify-hosted-admin.mjs`, gerçek enrollment yanıtını tarayıcıdan alıp QR'ın decode edildiğini de doğrulayacak şekilde genişletildi; kişisel yönetici hesabı veya faktörü değiştirilmez, yalnız geçici sentetik kullanıcı kullanılır.

Güncelleme `dpl_BrRj2fAT2ULYcrfdyWkJQdury9y2` staging dağıtımı olarak READY. Sabit önizlemede gerçek Supabase ile tarayıcıdan parola girişi, QR decode, TOTP doğrulama, AAL1 reddi/AAL2 erişimi ve izin iptali testi başarılı. Geçici sentetik kullanıcı temizlendi; gerçek yönetici faktörü değiştirilmedi. Önceki arayüzü açık tutan kullanıcı sayfayı yenileyip yeniden giriş yapmalıdır. Intake 503 kalır; bu düzeltme gerçek başvuru kabulünü açmaz.

## 22 Ekim — ziyaretçi hesap zorunluluğu

Formda görülen hesap açma/giriş isteği Vercel deployment protection kaynaklıydı. Yalnız bu projede `ssoProtection=null` ayarlandı; yeni dağıtım veya production yayını yapılmadı. Yeni, çerezsiz Chromium context'i ile sabit URL doğrudan Alvera Form'u açtı, Vercel'e yönlendirmedi. Aynı anonim context'te admin session 401, özel belge erişimi 401, intake 503 döndü. Yönetici MFA ve gerçek başvuru kabul kapıları korunuyor. Önceki rapor bölümlerindeki Vercel korumasının korunduğu ifadeleri tarihsel test durumudur; güncel preview erişimi herkese açıktır.

## 22 Ekim — Alvera Form adı

Görünen marka Alvera Form olarak güncellendi: logo altı, metadata, footer, PDF ve yeni MFA faktörü adı. Şifreleme/DB dosyaları ve kayıt referansları taşınmadı. Strict TypeScript, production build ve 31/31 Vitest başarılı; sentetik PDF metninde ALVERA FORM bulundu ve Nostos bulunmadı. Staging dağıtımı `dpl_CcGGCSpsooEsQWcF4bSUKnAvkDFF` READY; sabit önizleme adresi korundu. Barındırılan ana sayfa ve admin ekranı tarayıcıda başlık ve görünen metin bakımından kontrol edildi. Yeni domain alınmadı, production başvuru kabulü açılmadı.

## 22 Ekim — Resend, Turnstile ve gerçek yönetici MFA testi

Resend koşul onayı doğrulandı; ücretsiz `nostos-forms-mail` kaynağı (`ir_cFfXuxUCVaJ2kW1g`) oluşturuldu ve yalnız preview/development'a bağlandı. Gerçek API anahtarıyla domain listeleme/detay sorgusu başarılı. `bildirim.lumoza.art`, `eu-west-1`, durum `not_started`; DKIM/SPF/MX DNS sorguları ENOTFOUND döndü. DNS kaydı değiştirilmedi, gerçek e-posta gönderilmedi. Sağlayıcıdan alınan tam kayıtlar [DNS_RECORDS](DNS_RECORDS.md) içinde; yetkili DNS paneli kullanıcıdan bekleniyor.

Cloudflare hesabına giriş doğrulandı. `Nostos Forms Preview` managed Turnstile widget'ı yalnız `nostos-forms-ouzhaanttnn-9387.vercel.app` için oluşturuldu; pre-clearance kapalı. Site key Config, secret key Secret olarak yalnız Vercel Preview ortamına eklendi; anahtarlar sohbet/log/Git'e yazılmadı. Gerçek kullanıcı challenge başarısı henüz sınanmadı; yalnız yapılandırma tamamlandı.

Yönetici kurulumunun e-posta/aydınlatma metnine bağlı kalması giderildi. Admin konfigürasyonu temel sunucu anahtarları, HTTPS, Supabase, getUser, aktif izin listesi ve AAL2 koşullarını korur. Varsayılan intake/upload/jobs tam servis/hukuki kontrolle kapalı kalır. Yeni birim testi, admin kurulumu açıkken intake'in 503 verdiğini ve kritik admin anahtarı eksikken admin'in de kapandığını doğruladı.

`npm test` **31/31**, strict TypeScript, production build ve `npm run test:e2e` **12/12** başarılı. Güncelleme Vercel `staging` dağıtımı `dpl_7EfgvpEYfsJVgEDqUaK3bkvsfjH5` olarak READY: https://nostos-forms-krpt8b9av-ouzhaanttnn-9387.vercel.app . Sabit önizleme https://nostos-forms-ouzhaanttnn-9387.vercel.app bu sürümü gösterir. Production açılmadı.

`scripts/verify-hosted-admin.mjs` bu barındırılan sürüm + gerçek Supabase üzerinde geçti: oturumsuz erişim/CSRF reddi, izin listesi dışındaki gerçek kullanıcının reddi, AAL1 ile okuma/yazma reddi, sentetik yönetici için gerçek TOTP enrollment/challenge/doğrulama ve AAL2 erişimi, izin iptalinden sonra mevcut oturumun reddi, intake'in 503 kalması. Yalnız geçici sentetik kullanıcı kullanıldı; test kullanıcısı ve kendi audit kayıtları finally içinde temizlendi. Kişisel yönetici MFA'sı kurulmadı; onun telefon eşleştirmesi kullanıcı tarafından yapılacak.

Güncel barındırılan sürümde desktop/Pixel 7 form önizleme kontrolleri tekrar geçti; dosya/imza seçimi cihazda kalıyor, gönderim kapalı. Yönetici giriş ekranı Chromium'da yüklendi ve boş alanlarla `test-results/hosted-admin-login.png` olarak kaydedildi. İlk screenshot denemesindeki yanlış düğme seçicisi `Güvenli giriş` olarak düzeltildi; bu bir uygulama hatası değildi. Vercel koruması kapatılmadı, geçici test çerez dosyası silindi.

## 22 Ekim — yönetilen Supabase kurulumu ve canlı servis testleri

Kullanıcının servis kurulumu talebi ve Marketplace koşul onayı sonrası ücretsiz `nostos-forms-test` (`mxoktkgwmcntqxdifztf`, Frankfurt) oluşturuldu. Yalnız `nostos-forms` Vercel projesinin preview/development ortamlarına bağlı; production ortamına bağlanmadı. Supabase paketinin resmi agent skill'i kuruldu ve yönergesi okundu. Güncel changelog ve ilgili TLS/PostgreSQL güvenlik değişiklikleri incelendi.

`scripts/migrate-supabase.mjs` gerçek PostgreSQL 17.11 üzerinde ilk migration'ı tek transaction içinde uyguladı. İkinci çalıştırma checksum eşleşmesini doğruladı. CA/hostname denetimi açık kaldı; doğrulanmamış TLS kullanılmadı. `nostos_ops.migrations` metadata tablosu API erişimine kapalı şemada ve RLS ile korunur.

`scripts/verify-supabase.mjs` gerçek yönetilen serviste başarılı:

- Dokuz uygulama tablosunda RLS; anon/authenticated için tablo erişimi ve altı ayrı RPC yetkisi kapalı.
- Private bucket; gerçek sentetik PNG yükleme/indirme ve 30 saniyelik signed URL erişimi başarılı. Anon download/list ve public URL erişimi reddedildi.
- DB transaction içinde sentetik başvuru/belge bağlama, referans, tekrar gönderimde aynı kayıt/tek outbox, durum değişimi ve e-posta hatasında başvurunun korunması doğrulandı. Transaction rollback yapıldı; sentetik Storage objesi finally bloğunda silindi.
- Supabase HTTP anon tablo/RPC istekleri reddedildi. Genel signup Dashboard'dan kapatıldı ve Auth settings HTTP yanıtıyla `disable_signup=true` doğrulandı. TOTP etkin; AAL1 oturum süresi sınırı etkin.
- İlk yönetici oluşturuldu ve aktif izin listesine eklendi. Gerçek parola girişi, getUser ve izin kaydı kontrolü başarılı; oturum AAL1. Kişisel TOTP telefonla eşleştirilmedi; AAL2 girişi henüz doğrulanmış sayılmaz.

Yeni scriptler formatlandı; strict TypeScript ve **30/30 Vitest** tekrar geçti. Önceki **12/12 Playwright** sonucu uygulama arayüzü için geçerlidir; bu aşamada uygulama arayüzü değiştirilmedi. npm audit **0** bulgu verdi. Yeni dev bağımlılık `postgres@3.4.9` yalnız migration/test araçları içindir.

Vercel preview ortamına rastgele üç ayrı uygulama anahtarı, APP_MODE/APP_URL/ADMIN_EMAIL ve kapalı hukuki/belge/imza ayarları eklendi; secret değerleri çıktılara/Git'e yazılmadı. Servis credential'ları yalnız ignored `.local` içinde. E-posta gönderilmedi. Resend kurulumu ayrı hesap sahibi koşul onayı bekliyor; gönderici için `bildirim.lumoza.art` alt alanı seçildi, DNS henüz değiştirilmedi. Yetkili DNS sunucuları Google Domains olduğundan Vercel'de kayıt eklemek tek başına doğrulama sağlamaz. Cloudflare oturumu açık değil; giriş bekleniyor. Dosya taraması, hukuki metin, kişisel MFA ve scheduler hâlâ tamamlanmalı; başvuru kabulü açılmadı.

## 22 Ekim — belge ve imza düzeltmesi

Güncel Vercel dağıtımı `dpl_BKjLoBgc4RmHegMHZ9ZpeNy6PUGP`, hedef `staging`, durum `READY`. Sabit bağlantı https://nostos-forms-ouzhaanttnn-9387.vercel.app bu dağıtıma yönleniyor. Değişmez sürüm URL'si https://nostos-forms-bpk303amz-ouzhaanttnn-9387.vercel.app . Önceki dağıtım URL'si eski arayüzü göstermeye devam eder.

Barındırılan bu sürümde `scripts/verify-preview.mjs` masaüstü ve Pixel 7 için de geçti. Vercel koruması kapatılmadı; CLI'nin yetkili bypass çerezi yalnız test origin'inde kullanıldı ve yerel geçici çerez dosyası test sonrası silindi. Development OIDC yöntemi Vercel Trusted Sources ortam eşleşmesi nedeniyle 403 verdi; koruma kuralı değiştirilmedi. Başarılı tarayıcı kontrolünde dosya seçimi/önizlemesi, hata mesajları, imza çizimi/temizliği/geri dönüşte korunması, sıfır otomatik başvuru POST'u, kapalı gönderim ve elle intake isteğinde 503 doğrulandı.

Vercel önizlemesinde kimlik ön/arka yüz seçimi, dosya önizlemesi ve çizim imzası açıldı. Önizleme dosyaları yalnız tarayıcı belleğinde tutar; otomatik upload veya sahte kayıt başarısı üretmez. Canlı ortamdaki belge/imza varsayılanı ve eksik güvenlik/servis/hukuki ayarlarda API reddi korunur.

Dosya seçimi uzantı + MIME eşleşmesini, boş dosyayı ve boyut sınırını artık anında kontrol ediyor. Sunucuya gönderilen uzantı orijinal dosyanın güvenli son uzantısından gelir; dosya adı veya kişisel bilgiler header'a taşınmaz. Adımlar arasında geri dönünce imzanın görünürde kaybolması düzeltildi; çizim PNG'si yeniden canvas'a yüklenir ve temizleme gerçekten seçili imzayı kaldırır.

Son kontroller: strict TypeScript başarılı; Vitest **30/30**, masaüstü + mobil Playwright **12/12**, production build başarılı. Production önizleme sunucusunda `scripts/verify-preview.mjs` hem masaüstü hem Pixel 7 için geçti: belge alanları görünür, eksik dosya/imza engeli, yanlış uzantı hatası, dosya önizlemesi, klavye çizimi, geri dönüşte koruma, imza temizleme ve yeniden çizim. Dosyalar seçilirken intake/upload/applications POST sayısı sıfır; son gönderim düğmesi kapalı ve elle intake POST denemesi 503. Masaüstü ve mobil belge adımı görselleri ayrıca incelendi.

Canlı tamamlanma durumu: Supabase bağlı değil; Vercel preview ortamında servis environment kaydı yok. Resend Marketplace ücretsiz planı bulunuyor ancak kurulum sahip olunan gönderici domain'i istiyor; kullanıcıdan domain ve onaylı aydınlatma metni bilgisi bekleniyor. Turnstile ve dosya tarama gateway'i de yapılandırılmamış. Gerçek kimlik belgesi kaydı veya gerçek e-posta teslimi doğrulanmış sayılmaz.

## Vercel önizleme güncellemesi

Kullanıcının Vercel yükleme talebiyle `ouzhaanttnn-9387/nostos-forms` projesinde önizleme oluşturuldu. Deployment `dpl_EzDNCynoWZYmuRmjmfGhqt6Dx4dz`, API hedefi `staging` (Vercel'in önizleme hedefi), durum `READY`. URL: https://nostos-forms-r379qz8vm-ouzhaanttnn-9387.vercel.app . Framework Next.js 16.4.2, Node.js 24.x; yaklaşık 38 saniyede dağıtım hazır oldu. Henüz Git commit'i olmadığı için mevcut çalışma dizini kaynak dosyaları kullanıldı; GitHub'a push yapılmadı.

Önizleme değişikliği sonrasında strict typecheck ve build geçti; Vitest **29/29**. Ek test, Vercel preview arayüzü açıkken eksik ayarlarda API'nin kapalı kaldığını ve production'ın form açmadığını doğruluyor. `scripts/verify-preview.mjs` ile yerel production sunucusunda dört form adımı, kapalı gönderim düğmesi ve intake HTTP 503 doğrulandı. Vercel üzerinde yetkili HTTP isteğinde ana sayfa 200, doğru başlık/form/önizleme uyarısı ve intake POST 503 doğrulandı. Gerçek veri veya e-posta gönderilmedi. Yükleme dry-run kontrolü `.env.local`, `.env.example`, `.local`, `.git`, test çıktıları ve node_modules dosyalarının dışarıda kaldığını doğruladı.

Vercel erişim koruması korundu; URL açılırken sahibinin Vercel hesabıyla giriş gerekebilir. Bağlantı API'si proje oluşturmayı 403 ile reddetti; aynı yetkili ekip için CLI yolu başarılı oldu. İlk CLI dağıtımı `--environment preview` seçimine rağmen Vercel tarafından production'a otomatik yönlendirildi; **READY olmadan iptal edildi ve domain atanmadı**. Son dağıtımda REST API'nin belgelenmiş açık `target=staging` değeri kullanıldı ve hedef ayrıca doğrulandı. İlk iptal edilmiş dağıtım ID: `dpl_6kDuMJk89VBZzJnVcaTn47A5CtpR`. Gerçek production yayını açılmadı.

Alttaki ilk teslim sonuçları ilk geliştirme aşamasının kaydıdır; güncel test sayısı yukarıdadır.

## Tamamlanan kapsam

Alvera logolu mobil/masaüstü başvuru formu ve yönetim paneli, yapılandırılabilir alanlar/belge/imza toplama, kalıcı şifreli yerel kayıt ve Supabase adaptörü, migration/RLS/RPC transaction'ları, private dosya erişimi, gözden geçirme/referans/idempotency, Resend outbox ve worker, PDF, silme değerlendirmesi ve saklama kontrolleri tamamlandı. Gerçek servislerin kimlik bilgileri sağlanmadığı için canlı entegrasyon doğrulaması yapılmadı. GitHub'a push ve production deployment yapılmadı.

## Ortam ve çalıştırılan kontroller

Windows PowerShell; Node.js 24.19.0, npm 11.17.0. Lockfile ile Next.js 16.4.2, React 19.3.1, TypeScript 7.0.2, Tailwind 4.3.3, Vitest 5.0.5, Playwright 1.64.1 kullanıldı. Registry'den kararlı sürümler çözümlendi; resolver paketinin optional peer uyuşmazlığı nedeniyle ek bağımlılık eklenmeden RHF + doğrudan Zod doğrulaması seçildi.

| Kontrol                             | Sonuç / kapsam                                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                 | Strict TypeScript başarılı                                                                                                      |
| `npm test`                          | 28 test; doğrulama, crypto, dosya, veri/worker, auth, SQL, e-posta ve scanner sözleşmeleri                                      |
| `npm run test:e2e`                  | 12 test; Chromium masaüstü ve Pixel 7 mobil emülasyonu                                                                          |
| `npm run build`                     | Optimize production build başarılı, son derlemede uyarı yok                                                                     |
| `npm audit --audit-level=moderate`  | 0 bilinen zafiyet; denetim anındaki registry sonucu, gelecekte garanti değil                                                    |
| Production HTTP fail-closed         | `next start` ile yerel mod/eksik canlı ayarlarda API 503, başvuru ekranı kapalı                                                 |
| Secret/kişisel hedef adres taraması | Git'e dahil olabilecek dosyalarda yerel secret veya hedef e-posta değeri bulunmadı; `.env.local`/`.local` ignore kontrolü geçti |

## İstenen 12 senaryo

| Senaryo               | Kanıt                                                                                                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Başarılı başvuru      | Tarayıcı → gerçek HTTP → SQLite → referans ekranı; sentetik PNG ve çizim                                                                                                    |
| Eksik/yanlış veri     | Alan hataları, invalid JSON/schema, yanlış telefon/e-posta/tutar/adres/ilçe testleri                                                                                        |
| Kimlik numarası       | TCKN ve VKN algoritmaları, bozuk checksum/baştaki sıfır ve maskeleme                                                                                                        |
| Dosya boyutu/türü     | JPEG/PNG/PDF MIME + uzantı + magic + decode; sahte/truncated dosya, 6 MB reddi; boş imza reddi                                                                              |
| Yetkisiz belge        | Oturumsuz indirme 401, başka intake belgesini bağlama 403, silinmiş belge 404; public URL üretilmiyor                                                                       |
| Yönetici oturumu/izin | Yerel iki adımlı giriş HTTP testi; parola tek başına yetki vermiyor. Gerçek Supabase çağrıları yerine birim testte izin listesi, getUser ve AAL2 sözleşmeleri simüle edildi |
| Tekrar gönderim       | Aynı intake ile paralel HTTP POST aynı referansı verir; tek başvuru ve audience başına unique outbox                                                                        |
| E-posta hatası        | Kalıcı failed/attempt/backoff, başvurunun korunması ve yeniden deneme; Resend HTTP isteği mock ile hedef/body/idempotency kontrolü                                          |
| PDF/Türkçe            | Yetkili HTTP download, pdf-lib parse, PDF.js metin çıkarımında Ç/ğ/Ş/ü, maskeli kimlik ve PNG render görsel kontrolü                                                        |
| Mobil imza            | Chromium CDP gerçek touchStart/touchMove/touchEnd olayları; desktop mouse çizimi; upload ve başvuru akışı                                                                   |
| Durum değişimi        | Geçerli/geçersiz geçişler SQLite/PostgreSQL; yönetim arayüzünde güncelleme ve history                                                                                       |
| Log sızıntısı         | Hassas hata gövdesiyle log/yanıt testi; sabit event kodları; secret taraması                                                                                                |

Ek: PGlite'da migration gerçekten yürütüldü; dokuz tabloda RLS, anon/authenticated tablo/RPC reddi, private bucket tanımı, transaction rollback, outbox claim/lease, not ve silme akışları test edildi. PGlite, yönetilen Supabase Storage veya Auth sunucusunun birebir canlı testi değildir.

Ek: Axe WCAG 2 A/AA ve 2.1 AA ilk form taraması hem masaüstü hem mobilde ihlal vermedi. Düşük metin kontrastları düzeltildi. Otomatik tarama tam erişilebilirlik sertifikası değildir; tüm adımların gerçek ekran okuyucu/iOS Safari/Android cihazla manuel testi canlı öncesi yapılmalıdır. E2E Chromium emülasyonudur; gerçek mobil donanım testi değildir.

## Görsel QA

İlk form ve yönetim detayının masaüstü/mobil ekran görüntüleri incelendi; yatay form taşması kontrol edildi. Alvera logosunun oranları korunuyor. PDF'nin ilk render'ında variable font nedeniyle harf kayıpları görüldü; PDF için statik Noto Sans'a geçildi. Son raster kontrolünde Türkçe metin, logo, maskeli kimlik, satır kaydırma ve sayfa altlığı okunabilir; çizim imzası etkin örnek de üretildi.

Yeniden inceleme için `test-results/initial-*.png`, `form-*.png`, `admin-*.png`, `tmp/pdfs/synthetic-application.pdf` ve `tmp/pdfs/page-1.png` testler/render script'iyle üretilir. Bunlar sentetik test çıktılarıdır ve Git dışında bırakılmıştır.

## Doğrulanmayan servisler ve açık yayın engelleri

- Gerçek Supabase proje bağlantısı, yönetilen Storage politikaları ve gerçek TOTP kurulumu/refresh oturumu.
- Resend API anahtarı, doğrulanmış gönderici domain/DNS ve hedef Gmail'e gerçek teslim. Hedef adres yalnız yerel `.env.local` dosyasındadır; bildirim gönderilmedi.
- Cloudflare gerçek sitekey/secret, canlı challenge/hostname/action/replay kontrolü. Yerel mod bypass'ı açıkça işaretlidir.
- Gerçek antivirüs gateway ve temiz/zararlı sentetik dosyayla canlı doğrulama. Sözleşme testleri mock HTTP kullanır.
- Onaylı aydınlatma, hukuki dayanak/aktarım mekanizması/veri sorumlusu ve saklama süresi. Hukuki onay olmadan gerçek veri toplamayın.
- HTTPS hosting, job scheduler, monitoring/alarmlar, backup restore, günlük Storage/DB uzlaştırması, bağımsız güvenlik incelemesi.

Mevcut uygulama bunların eksik olduğu production konfigürasyonunda başvuru kabul etmez. Belgeler/imza varsayılan kapalıdır; açmak ayrıca hukuki değerlendirme ve tarama gerektirir.

## Kullanıcının yapacağı işler

Supabase, Resend, Cloudflare hesapları ve gönderici alan adını seçip [SETUP](SETUP.md) adımlarını uygulayın; servis secret'larını sohbet/Git yerine hosting ortamına girin. Admin oluşturun/izin verin/MFA kurun. Hukuki metinleri ve retention'ı yetkili kişiyle tamamlayın. Scheduler ve alarmları kurun. Staging'de sentetik başvuru ile gerçek teslim/erişim testlerini tamamlayın. Ücretli kaynak veya yayın için ayrıca karar verin. Eksik değişken listesi ve maliyet için gerekli trafik/depolama/e-posta/region/plan bilgileri [DEPLOY](DEPLOY.md) içindedir.

## 23 Ekim 2026 ek doğrulama — ikametgâh PDF

Bu bölüm önceki ilk kurulum durumundan sonradır. İkametgâh için bağımsız etkinlik/zorunluluk ayarı, PDF tür kontrolü, private belge kaydı, yönetici etiketi ve başvuru PDF'sinde yüklenme bilgisi eklendi. Yeni migration bağlı Supabase test projesine uygulandı.

- Vitest: 33/33 geçti; PDF politika kapısı, zorunluluk, kayıt ve PostgreSQL MIME kısıtı dahil.
- Playwright: masaüstü/mobil toplam 14/14 geçti. Sentetik ikametgâh PDF'siyle gerçek yerel HTTP kayıt, PDF önizleme, PNG reddi, sahte PDF reddi ve yönetici belge erişimi doğrulandı.
- Gerçek kişisel ikametgâh belgesi kullanılmadı. Yerel kayıt testi yönetilen Storage/tarama/gerçek e-posta teslimini doğrulamaz.
- Ayrı bulut doğrulamasında Supabase private Storage/RLS, yönetici allowlist/AAL2 ve QR görüntüsü test edilmişti; kişisel yöneticinin TOTP faktörü verified durumunda. Resend alan adı DNS doğrulaması, gerçek e-posta teslimi, antivirüs ve hukuki metinler halen tamamlanmadı.
- Vercel önizlemesi `dpl_BLFhT3kqNhtzqNR8VZUtXWsizN2K` READY. Çerezsiz mobil Chromium'da ikametgâh PDF seçimi ve önizleme bağlantısı doğrulandı. Yetkisiz belge 401, eksik canlı yapılandırmada intake 503; gerçek belge yüklenmedi.
- `npm run build` başarılı. Yönetilen Supabase doğrulaması yeni ikametgâh PDF metadata kaydını başvuruya bağladı; sentetik transaction geri alındı. Private Storage/RLS kontrolleri geçti; gerçek e-posta gönderilmedi.
