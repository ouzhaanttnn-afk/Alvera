# Yayına geçiş

Ziyaretçi erişimi: Kullanıcının formun hesap açtırdığı geri bildirimi üzerine yalnız bu projenin Vercel Authentication kapısı kaldırıldı (`ssoProtection=null`). Preview artık Vercel hesabı gerektirmeden açılır; gelecekteki preview sürümleri de bu ayarı devralır. Bu production başvuru kabulünü açmaz. Uygulamanın yönetici getUser/izin listesi/AAL2 kontrolleri korunur. Temiz ve çerezsiz tarayıcıda form görünürlüğü, admin/belge API'lerinde 401 ve intake'te 503 doğrulandı.

Son durum: yönetici kurulumu açık olan yeni staging sürümü `dpl_7EfgvpEYfsJVgEDqUaK3bkvsfjH5` hazır. `/admin` girişi başvuru kabulünden bağımsız temel güvenlik kontrolüyle açılır; AAL2 zorunluluğu gerçek sentetik Supabase hesabıyla test edildi. Resend free kaynağı bağlandı, DNS doğrulaması bekliyor. Cloudflare Turnstile anahtarları yalnız Preview ortamında ayarlandı; gerçek challenge testi bekliyor. Başvuru kabulü hâlâ kapalı: DNS/teslim, scanner, hukuki metin/onay, kişisel yönetici MFA ve scheduler tamamlanmalıdır.

22 Ekim servis durumu: ücretsiz Frankfurt Supabase test kaynağı oluşturuldu ve yalnız preview/development ortamına bağlandı; migration, private Storage ve erişim kısıtları gerçek serviste test edildi. Preview için uygulama secret'ları ve hedef yönetici adresi eklendi. Genel signup kapalı. Resend koşul onayı, Cloudflare giriş/Turnstile kurulumu, yetkili DNS doğrulaması, tarama gateway'i, kişisel yönetici MFA'sı ve hukuki inceleme bekleniyor. Bu ayarlar tamamlanmadan production ortamı/gerçek veri kabulü açılmadı. `.env.example` anahtar adlarını içerir; yerel gerçek servis değerleri ignored `.local` dosyalarındadır.

22 Ekim güncel önizleme: https://nostos-forms-ouzhaanttnn-9387.vercel.app . Kimlik ön/arka yüz seçimi ve çizim imzası sentetik testler için açık; dosyalar cihazda kalır ve kayıt kapalıdır. Dağıtım `dpl_BKjLoBgc4RmHegMHZ9ZpeNy6PUGP` (`staging`, `READY`). Vercel hesabıyla giriş gerekebilir. Eski değişmez dağıtım URL'leri güncellenmez; bu sabit bağlantıyı kullanın. Yerel ve barındırılan masaüstü/mobil test sonuçları [TEST_REPORT](TEST_REPORT.md) içindedir.

Kullanıcının sonraki talebiyle Vercel önizlemesi oluşturuldu: https://nostos-forms-r379qz8vm-ouzhaanttnn-9387.vercel.app . Hedef `staging`/preview, durum `READY`; başvuru ve e-posta kabulü kapalıdır. Ücretli plan başlatılmadı, gerçek production verisi değiştirilmedi. GitHub'a yükleme için kullanıcının ayrı komutu beklenir. İlk Vercel CLI dağıtımlarında otomatik production hedefi oluşabilir; hedefi kontrol etmeden tamamlanmasını beklemeyin. Bu çalışmada otomatik production dağıtımı yayınlanmadan iptal edilmiş, ardından açık REST `target=staging` ile önizleme oluşturulmuştur.

## Çalıştırma hedefi

Node.js 24+ destekleyen Node sunucusu veya uyumlu Next.js hosting seçin. `npm ci`, `npm run build`, ardından `npm start` gerekir. Production'da `APP_MODE=local` **yasaktır**; yerel adaptörün production'da devre dışı bırakılması test edilmiştir. Development server'ı dışarı açmayın. Production vars, `.env.local` dosyasından otomatik taşınmış varsayılmaz. Test/staging ve production ayrı Supabase projeleri ve anahtarları kullanmalıdır.

`assets/fonts/NotoSans-Regular.ttf` ve `public/brand/alvera.png` PDF üretiminde okunur. Hosting dosya paketinde ikisinin bulunduğunu doğrulayın. Web arayüzü ayrı variable font dosyasını `public/fonts` altından sunar; PDF uyumluluğu için statik font kullanılır. `PRIVACY_NOTICE_PATH`, sunucuda okunabilen gerçek onaylı metin dosyasına işaret etmelidir; dosyayı güvenli mount veya deployment paketine açıkça ekleyin. `.local`, test çıktıları ve `.env*` server tracing dışında tutulur. Metin dosyasını `.local` içine koyup paketleneceğini varsaymayın.

Zamanlayıcı dakikada bir `POST /api/jobs` + Bearer secret çağırmalıdır; `GET` desteklenmez. Platformun cron ürünü yalnız GET destekliyorsa yetkili harici scheduler veya sunucu cron kullanın. Worker tek çağrıda en fazla 20 bildirim, 200 terk edilmiş kayıt ve 100 süresi dolmuş başvuru işler. Gerekirse izlemeyle batch/sıklık kapasitesini ölçüp artırın. Job hata oranı, en eski outbox yaşı, 8 denemeye ulaşan/23 saati aşan kayıtlar ve biriken silme talepleri için alarm kurun. Gönderim sonucu API kabulünü gösterir; Gmail teslimi/inbox yerleşimi garantisi değildir. Bounce/complaint izleme Resend panelinde ayrıca yapılmalıdır.

## Yayını engelleyen kontroller

- [ ] Veri sorumlusu unvanı ve iletişim kanalları, gerçek aydınlatma metni ve sürümü yetkili kişi tarafından onaylandı.
- [ ] Her alanın amacı, hukuki dayanağı ve zorunluluğu belirlendi; TCKN/VKN toplamanın gerekliliği ayrıca doğrulandı.
- [ ] Belge/imza gerekliliği doğrulanmadan `DOCUMENTS_ENABLED=false`, `SIGNATURE_ENABLED=false` kaldı.
- [ ] Yurt dışı aktarım, hizmet sağlayıcı/region, veri işleyen sözleşmeleri ve gerekli hukuki mekanizmalar değerlendirildi.
- [ ] Retention/silme süreleri ve yasal saklama istisnaları belirlendi; `RETENTION_DAYS` kuruma göre ayarlandı. Varsayılan 365 bir hukuki öneri değildir.
- [ ] Supabase migration gerçek test projesinde çalıştırıldı; anon/authenticated tablo ve Storage erişimi negatif test edildi.
- [ ] Genel Auth signup kapalı; yalnız izinli yöneticiler mevcut; gerçek TOTP AAL2 zorunluluğu test edildi.
- [ ] Birbirinden farklı şifreleme, token ve job anahtarları secret manager'da; yedek ve geri yükleme prova edildi.
- [ ] HTTPS ve doğru `APP_URL`; rate limit proxy header güven zinciri ve body limitleri doğrulandı.
- [ ] Gerçek Turnstile challenge, expiry/replay, yanlış hostname/action testleri geçti.
- [ ] Resend domain/DNS, API key, sender, hedef yönetici adresi ve job scheduler kuruldu; sentetik başvurunun Gmail'e teslimi kontrol edildi.
- [ ] Belgeler açılacaksa gerçek antivirüs gateway, EICAR gibi uygun sentetik güvenlik testleri, erişim ve depolama bölgesi doğrulandı.
- [ ] Yetkili PDF/font/logo, maskelenme, mobil/klavye ve silme testi staging'de tekrarlandı.
- [ ] Bağımlılık taraması ve bağımsız uygulama güvenlik incelemesi tamamlandı; bu repo testleri bağımsız sızma testi değildir.
- [ ] İzleme/incident sorumlusu, alarm kanalı ve hukuki ilgili kişi başvuru kanalı belirlendi.
- [ ] Yayın için kullanıcı onayı alındı.

## Gereken servisler ve değişkenler

Supabase (PostgreSQL, Auth, private Storage), Resend (doğrulanmış gönderici domain), Cloudflare Turnstile, HTTPS hosting ve POST destekli scheduler; belgeler açılacaksa antivirüs gateway. Tüm isimler `.env.example` dosyasında. Canlı kullanım için henüz Supabase üçlüsü, Resend anahtarı/göndericisi, Turnstile ikilisi, gerçek HTTPS URL, hukuki metin/sürüm/veri sorumlusu, canlı secret'lar ve scheduler yapılandırılmalıdır. Hedef yönetici adresi yerel ortamda ayarlanmıştır; hosting'de `ADMIN_EMAIL` ayrıca girilmelidir.

## Maliyeti doğrulamak için bilgiler

Kesin aylık ücret için aylık başvuru sayısı, eşzamanlı trafik, seçilecek hosting/region/plan, belge toplama durumu, ortalama dosya boyutu, saklama süresi, indirme/egress hacmi, yönetici sayısı, yedek/PITR gereksinimi, e-posta hacmi ve antivirüs sağlayıcısı gerekir. Plan fiyatı ve limitleri satın almadan önce sağlayıcıların resmi fiyat sayfalarından yeniden doğrulanmalıdır; bu projede ücretli plan seçilmedi ve doğrulanmamış bir fiyat taahhüdü verilmedi.

Kapasite hesabı: aylık e-posta yaklaşık başvuru sayısı × (1 + alındı bildirimi oranı); depolama yaklaşık aylık başvuru × ortalama belge toplamı × saklama ayı. Bunlara egress, yedek, DB ve hosting maliyetleri eklenir.
