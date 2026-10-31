# Test sonuçları — 31 Ekim 2026

Ortam: Linux, Node 22, Next.js 16.4.2, PostgreSQL 18 (PGlite), Chromium (Playwright). Tüm veriler sentetiktir.

| Kontrol | Komut | Sonuç |
|---|---|---|
| Tip kontrolü | `npm run typecheck` | Geçti |
| Birim + veritabanı/RLS + rapor | `npx vitest run` | 10 dosya, **83/83 geçti** (MASAK RAPORU: 3 dosya, 49 test) |
| Uçtan uca | `npx playwright test` | **21 geçti**, 5 atlandı (MASAK akışları yalnızca masaüstü projesinde; mobil taşma ayrı testte) |
| Üretim derlemesi | `npm run build` | Geçti; MASAK RAPORU kodundan uyarı yok (4 uyarı mevcut `lib/storage.js` dosyasından) |
| Lint | — | Projede ESLint yapılandırılmamış; çalıştırılmadı |
| OCR (tarayıcı) | Elle Playwright betiği | Tesseract.js 7 jsDelivr'dan yüklendi, sentetik MRZ okundu; belge no ve doğum tarihi kontrol haneleri doğrulandı, isimde OCR hatası görüldü (manuel onay gerekliliğini doğrular) |

## İstenen 14 test ve karşılıkları

| # | Gereksinim | Test |
|---|---|---|
| 1 | Oturumsuz kişi paneli göremez | `e2e/masak-raporu.spec.ts` "Test 1" (sayfalar → giriş, belge API 401, rapor 401, farklı Origin 403, noindex/no-store) |
| 2 | Başka tenant kayıtlarına erişilemez | `db.test.ts` "Test 2" (RLS okuma, yazma, bileşik FK ile ilişkilendirme) |
| 3 | Yetkisiz belge indiremez | `db.test.ts` "Test 3" (personel/denetçi reddi, DB fonksiyonu reddi, blob tablosuna doğrudan erişim reddi, erişim kaydı) |
| 4 | 369.999 / 370.000 TL farklı; istisnalar ayrı | `logic.test.ts` "Test 4" (sürekli ilişki, şüphe, kimlik şüphesi, iptal/düzeltme) + e2e "Personel" akışı |
| 5 | 228.000 + 165.000 = 393.000 TL | `logic.test.ts` "Test 5 & 6" + `db.test.ts` onaylı demo grubu |
| 6 | Bağımsız işlemler otomatik bağlanmaz | `logic.test.ts` (yalnızca "Bilgi" seviyesinde öneri; önerilmiş/reddedilmiş grup toplanmaz) |
| 7 | Şüphe değerlendirmesi tutardan bağımsız | `db.test.ts` "Test 7 & 11" + e2e |
| 8 | İptal/düzeltme denetim izini korur | `db.test.ts` "Test 8" (tutar değişikliği ve silme reddi, versiyonlar, hash zinciri) |
| 9 | OCR onaysız teyit sayılmaz | `db.test.ts` "Test 9" (CHECK kısıtı + uygulama kontrolü) |
| 10 | PDF'te doğru referanslar | `reports.test.ts` "Test 10" (işlem no, müşteri, rapor ref, uyarı metni, sayfa no, SHA-256 kaydı, maskeleme) |
| 11 | ŞİB kayıtları yetkisize görünmez | `db.test.ts` "Test 7 & 11" (personel, yönetici, denetçi) |
| 12 | CSV hatalı satır, mükerrer, tutar hatası | `logic.test.ts` "Test 12" + `db.test.ts` CSV (veritabanı eşleşmesiyle) |
| 13 | Gizli rapor yetkisiz export edilemez | `reports.test.ts` "Test 13" (H raporu, RLS insert reddi, ZIP'te gizli içerik yok) + e2e yönetici |
| 14 | İşlem tarihine göre kural versiyonu | `logic.test.ts` "Test 14" (6/7 Ekim 2026 sınırı, 2021/2022 eşikleri, İstanbul saat dilimi, çakışma hatası) |

## Bu ortamda doğrulanamayanlar

- Supabase Auth (gerçek e-posta/parola, TOTP MFA aal2), Supabase Storage ve Supavisor bağlantısı — anahtar/hesap yok. Aynı SQL gerçek PostgreSQL üzerinde, yerel kimlik doğrulama adaptörüyle test edildi.
- Vercel preview dağıtımı — dal gönderildi; preview'ın oluşup oluşmadığı Vercel panelinden kontrol edilmeli.
