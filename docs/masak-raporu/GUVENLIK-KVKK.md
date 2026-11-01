# Güvenlik ve KVKK — uygulananlar ve yapılacaklar

## Uygulananlar (kodda)

- **Kiracı izolasyonu:** Tüm iş tablolarında `organization_id`; ilişkiler `(organization_id, id)` bileşik yabancı anahtarlarla bağlı; RLS her sorguda. Test: başka işletme kaydını okuma/yazma/ilişkilendirme reddedilir.
- **Rol ve izin:** UI gizlemenin yanında sunucu eylemlerinde `ctx.need(...)` ve veritabanında `masak.has_perm(...)`. Hassas görüntüleme, belge indirme ve dışa aktarma kişi bazında ayarlanabilir.
- **Gizli ŞİB kayıtları:** `risk_cases` ve gizli uyarı/belge/denetim olayları yalnızca `cases.view` iznine görünür. Personel bildirim yapar, içeriği sonradan göremez (yalnızca numara döner).
- **Değişmezlik:** Denetim izi, kayıt versiyonları, uyarı değerlendirmeleri, inceleme olayları ve kural değerlendirmeleri güncellenemez/silinemez (tetikleyici). İş kayıtları silinemez; tamamlanmış işlem yalnızca iptal veya düzeltme ile değişir. Denetim izi organizasyon bazında SHA-256 hash zinciriyle bağlıdır ve panelden doğrulanır.
- **Kimlik doğrulama:** Açık kayıt yok, davet (72 saat, tek kullanımlık, yalnızca özeti saklanır). Parola ≥12 karakter; yerelde scrypt; 5 hatalı denemede 15 dk kilit; IP ve e-posta bazlı hız sınırı. İkinci faktör (TOTP) zorunlu; üretimde Supabase aal2. Oturum: HttpOnly, SameSite=Strict, üretimde Secure; 8 saat mutlak, 30 dk hareketsizlik sınırı (yerel), sunucu taraflı iptal.
- **CSRF/XSS:** Sunucu eylemlerinde Next.js Origin kontrolü; rotalarda ayrıca Origin=Host kontrolü; React kaçışlama; CSP, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`; dosyalar `attachment` ve `sandbox` CSP ile iner.
- **Önbellek/sızıntı:** Tüm panel rotaları dinamik, `Cache-Control: no-store, private`, `X-Robots-Tag: noindex`; robots.txt'de kapalı.
- **Dosya güvenliği:** Tür baytlardan doğrulanır (PDF/JPEG/PNG/WEBP), 10 MB sınırı, tahmin edilemez anahtar, uygulama katmanında AES-256-GCM, SHA-256 bütünlük kontrolü, yetki veritabanı fonksiyonunda, her erişim denetim izinde.
- **Veri minimizasyonu:** Kimlik görüntüsü zorunlu değil (Yön. md. 6/2); anne/baba adı gibi alanlar isteğe bağlı; OCR tarayıcıda, görüntü saklanmaz; hassas alanlar maskeli; loglara kişisel veri yazılmaz (`safeMessage` yalnızca hata kodu loglar); demo/test verisi yalnızca sentetik.
- **Gizli anahtarlar:** Servis rolü ve veritabanı bağlantısı yalnızca sunucuda; istemciye `NEXT_PUBLIC_` ile hiçbir gizli değer gitmez.

## Yapılacaklar (canlı kişisel veri toplanmadan önce ZORUNLU)

1. **Hukuk incelemesi:** KVKK aydınlatma metni, işleme şartları (md. 5/2-ç hukuki yükümlülük), saklama/imha politikası, özel nitelikli veri değerlendirmesi. Panelde saklama politikaları "hukuki doğrulama gerekiyor" durumundadır.
2. **Yurt dışı aktarım (KVKK md. 9):** Supabase bölgesi Türkiye dışındaysa yeterlilik kararı yoktur; Kurul standart sözleşmesi imzalanmalı ve **5 iş günü içinde Kurul'a bildirilmelidir** (7499 s. Kanun, yürürlük 1/6/2024; Yönetmelik RG 10/7/2024-32598). Bölge ve alt işleyenler (Supabase, Vercel, jsDelivr CDN) belgelenmeli.
3. **VERBİS** kaydı ve veri envanteri güncellemesi.
4. **Supabase ayarları:** Self-signup kapalı; e-posta onayı; parola politikası; MFA (TOTP) açık; `masak` şeması Data API'ye eklenmemeli; Storage kovası `masak-raporu-private` public=false; Point-in-Time Recovery.
5. **Anahtar yönetimi:** `DATA_ENCRYPTION_KEY` ve `TOKEN_SECRET` 32 bayt rastgele; Vercel'de "Sensitive" ortam değişkeni; anahtar yedeği ayrı ve çevrimdışı. Anahtar kaybı şifreli alanları ve belgeleri okunamaz kılar; rotasyon prosedürü (yeniden şifreleme betiği) henüz yazılmadı.
6. **Sızma testi** ve bağımsız güvenlik incelemesi (özellikle RLS politikaları, davet ve dosya akışları).
7. **Hız sınırı:** Vercel arkasında `TRUSTED_IP_HEADER=x-real-ip` gibi güvenilir başlık ayarlanmalı; aksi halde sınır global uygulanır.
8. **Uyum görevlisi ve iç politika:** ŞİB kararı kimin vereceği (T13 md. 10), iç bildirim akışı ve eğitim kayıtları.
9. **Yedekleme ve geri yükleme tatbikatı** (bkz. URETIM.md) ve olay müdahale/ihlal bildirimi prosedürü (KVKK md. 12/5, "en kısa süre").
10. **OCR:** Tesseract.js dil verisi jsDelivr'dan iner (müşteri verisi gönderilmez). Tam çevrimdışı çalışma isteniyorsa worker/core/dil dosyaları kendi alan adınızdan sunulmalıdır.
