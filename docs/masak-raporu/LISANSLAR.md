# Kullanılan açık kaynak paketler

| Paket | Sürüm | Lisans | Kullanım | Durum |
|---|---|---|---|---|
| next | 16.4.2 | MIT | Uygulama çatısı | Mevcut |
| react / react-dom | 19.3.1 | MIT | Arayüz | Mevcut |
| @supabase/supabase-js | 2.118.0 | MIT | Auth admin, Storage (sunucu) | Mevcut |
| @supabase/ssr | 0.12.7 | MIT | Supabase Auth oturum çerezleri | Mevcut |
| pdf-lib | 1.17.1 | MIT | PDF raporlar | Mevcut |
| @pdf-lib/fontkit | 1.1.1 | MIT | Türkçe font gömme | Mevcut |
| zod | 4.6.7 | MIT | Girdi doğrulama | Mevcut |
| lucide-react | 1.61.0 | ISC | İkonlar | Mevcut |
| tailwindcss | 4.3.3 | MIT | Stil | Mevcut |
| **tesseract.js** | 7.0.0 | Apache-2.0 | Tarayıcıda OCR | **Yeni** (bakım aktif, son yayın Aralık 2025) |
| tesseract.js-core | 7.0.0 | Apache-2.0 | OCR WASM çekirdeği (CDN'den) | Yeni (bağımlılık) |
| **postgres** | 3.4.9 | Unlicense | Üretimde Supabase Postgres bağlantısı | devDependencies → dependencies |
| @electric-sql/pglite | 0.5.10 | Apache-2.0 | Yerel demo ve testlerde gerçek PostgreSQL | Mevcut (dev) |
| Noto Sans | — | SIL OFL 1.1 | PDF fontu (`assets/fonts/OFL.txt`) | Mevcut |
| Tesseract dil verisi (tur, eng) | 4.0.0 | Apache-2.0 | jsDelivr üzerinden çalışma anında | Dağıtılmaz |

İncelenen ancak eklenmeyenler:

- **pdfme** (MIT): pdf-lib üzerine kurulu; şablon tasarımcısı ve ek bağımlılıklar getiriyor. Rapor ihtiyaçları mevcut pdf-lib ile karşılandı.
- **next.js/examples/with-supabase**: Supabase Auth çerez deseni (`@supabase/ssr` `createServerClient`) projede zaten aynı biçimde kullanılıyordu; kopyalanmadı.
- **ZIP kütüphaneleri** (ör. fflate, MIT): Sıkıştırmasız (STORE) ZIP için ~100 satırlık bağımlılıksız yazıcı yeterli ve test edildi.
- **Excel (.xlsx) okuyucuları**: SheetJS npm dağıtımının lisans/sürüm durumu ve exceljs'in ağırlığı nedeniyle eklenmedi; Excel'den "CSV UTF-8" dışa aktarımı önerilir.

Apache-2.0 bileşenlerin lisans ve NOTICE dosyaları `node_modules` içinde korunur; dağıtılan istemci paketinde tesseract.js lisans başlığı yer alır.
