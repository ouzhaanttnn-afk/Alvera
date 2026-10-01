# Alvera yonetim rehberi

- Panel: `/admin`. Giris bilgileri GitHub'a veya tarayici koduna yazilmaz. Ilk rastgele sifrenin tek yonlu dogrulayicisi sunucuya dagitilir. Acik sifre yalnizca bilgisayarinizdaki ozel giris dosyasindadir.
- Ilk giriste Guvenlik ve yedek bolumunden kendiniz bir sifre belirleyebilirsiniz. Bu islem tum oturumlari kapatir. Sifreyi sifirlama gerekiyorsa mevcut ozel security.json kaydi korunarak yetkili bir sunucu islemi yapilmalidir; herkese acik ilk-kaydolan-yonetici mekanizmasi yoktur.
- Yeni urun: ad, kategori, gercek ayar/malzeme, aciklama ve fotograf. Sitede yayimla kapaliysa taslaktir. Fotograf olmadan yayimlanmaz. Fiyat veya stok uydurulmaz; sorular urune ozel WhatsApp mesajiyla gelir.
- Fotograflar JPEG, PNG veya WebP olmali. Panel otomatik olarak 1600 piksele indirir, WebP yapar ve metadata/konum bilgisini yeniden kodlayarak temizler. Telefonunuz HEIC cekiyorsa JPEG disari aktarin.
- Ilk fotograf kapaktir. Oklarla fotograf ve urun siralarini degistirebilirsiniz.
- Arsivleme geri alinabilir. Fotoğraf dosyalari otomatik silinmez; urun geri yuklendiginizde baglantilari korunur.
- Magaza bilgileri bolumunde adres, telefon, WhatsApp, Instagram, saatler, kisa metinler ve magaza fotografi ayarlanir. Bilinmeyen saatleri ve Google puanini bos birakin.
- Google yorumlari otomatik olarak cekilmiyor. Dogrulanmis puan/sayi istege bagli olarak girilebilir; varsayilan durumda sadece Google Haritalar baglantisi gosterilir. Otomatik yorumlar icin Google Places API ve isletme kaydi baglantisi gerekir.
- JSON yedegi urunleri, ayarlari ve fotograf baglantilarini icerir; fotograf dosyalarinin kendisini veya sifreleri icermez. Blob depolarini silmeden once fotograf dosyalarini ayrica indirin.
- Domain baglaninca panelde Site adresi alanini degistirin. Canonical, urun paylasim adresleri, yapilandirilmis veri ve sitemap yeni adresi kullanir. Vercel Domains bolumundeki DNS kurulumu ayrica gerekir.

## Teknik notlar

Vercel'de ozel `alvera-catalog` deposu `BLOB_STORE_ID`, herkese acik `alvera-photos` deposu `MEDIA_STORE_ID` ile baglidir. SDK kimlik dogrulamasi Vercel OIDC kullanir; kaynak kodda Blob tokeni bulunmaz. Production ve Preview ayni depolarda farkli ad alanlari kullanir. `/api/manage` kimlik dogrulamasi, HttpOnly/Secure/SameSite oturum cerezleri, sunucu tarafli oturum iptali, CSRF ve origin kontrolu, sifre deneme siniri ve iyimser kilitleme uygular.

Katalog degisiklikleri kayit revizyonuyla yapilir. Iki sekme ayni kaydi degistirirse biri 409 hatasi alir; eski kayit yeni bilgiyi sessizce ezmez. Public API yalnizca yayindaki urunleri ve bunlarda kullanilan fotoğraflari dondurur. Depolama yoksa yonetim kapali kalir; serverless gecici diski kalici depo olarak kullanilmaz.

Yerel gelistirme: `npm install`, `npm run dev`. Yerel veriler `.local-data/` altinda kalir ve Git'e gitmez. `npm run build` yalnizca herkese acik dosyalari `dist/` altina kopyalar. Sunucu kodlari, sifre dosyalari ve `.env` dosyalari bu ciktida yoktur.
