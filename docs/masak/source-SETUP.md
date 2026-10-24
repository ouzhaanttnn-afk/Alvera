# Kurulum

## Yerel geliştirme

Node.js >=24, npm ve Git gerekir. `npm ci`, `npm run setup:local`, `npm run dev` çalıştırın. Kurulum mevcut `.env.local` dosyasını değiştirmez. `APP_URL` tarayıcıda kullandığınız adresle birebir eşleşmelidir; varsayılan `http://127.0.0.1:3000`. `localhost` ile `127.0.0.1` farklı origin'lerdir.

`/admin` için `.env.local` içindeki `LOCAL_ADMIN_PASSWORD`, ardından `LOCAL_ADMIN_TOTP_CODE` kullanılır. Bu yalnız geliştirme içindir. Dosyayı veya değerlerini mesaj, ekran görüntüsü veya Git ile paylaşmayın. Kullanıcının bildirim adresi yalnız bu yerel dosyaya eklendi; bulut ortamına otomatik aktarılmaz.

`DOCUMENTS_ENABLED=true` kimlik ön/arka yüz toplar; `SIGNATURE_ENABLED=true` çizim imzası toplar. Her biri açık olduğunda gönderimde gereklidir, birbirinden bağımsız kapatılabilir. Alan zorunlulukları `REQUIRED_FIELDS` JSON dizisiyle ayarlanır. Boş isteğe bağlı alan kabul edilir; doldurulmuş alan her zaman doğrulanır. Kimlik numarası kuralı bireyselde TCKN, kurumsalda VKN'dir. Yabancı kimlik/pasaport için doğrulanmamış bir algoritma sunulmaz; böyle bir kapsam gerekiyorsa hukuki ve veri modeli kararı gerekir.

## Supabase

22 Ekim'de kullanıcı onayıyla ücretsiz `nostos-forms-test` projesi (ref `mxoktkgwmcntqxdifztf`, Frankfurt) oluşturuldu ve yalnız Vercel preview/development ortamlarına bağlandı. Migration, dokuz tabloda RLS ve private bucket gerçek serviste doğrulandı. Genel signup kapatıldı; TOTP açık. DPA, aktarım ve hukuki inceleme tamamlanmadığından gerçek veri toplanmaz. Ayrıntılar [TEST_REPORT](TEST_REPORT.md) içinde. Yeni bir proje kurulacaksa:

1. `.env.example` dosyasındaki `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` değerlerini sunucu ortamına ekleyin. Hiçbir service role değeri `NEXT_PUBLIC_` değişkenine taşınmamalı.
2. Supabase migration CLI veya SQL editor ile `supabase/migrations/202610210001_initial.sql` dosyasını çalıştırın. Transaction testi PGlite'da yapılmıştır; Supabase yönetilen ortamında ayrıca doğrulayın.
3. `application-private` bucket'ının `public=false` olduğunu, objeler için anon/authenticated policy olmadığını ve tablo RLS'lerini doğrulayın. Doğrudan Storage erişimi sunucu service role ile sınırlıdır.
4. Supabase Auth'ta genel yeni hesap kaydını kapatın. Yetkili yöneticiyi Dashboard üzerinden oluşturun. Kimlik doğrulama e-postası/parola teslimini kendi güvenli sürecinizle yapın.
5. Yalnız bu projenin yetkili DB oturumunda, oluşturulan kullanıcı UUID'siyle:

```sql
insert into public.admin_users(id, active)
values ('<auth.users içindeki yetkili kullanıcı UUID>', true);
```

6. Auth'ta TOTP MFA etkin olsun. İlk yönetici girişinde QR kod gösterilir; doğrulayıcı uygulamaya ekleyin ve 6 haneli kodu doğrulayın. QR/secret saklamayın veya paylaşmayın. Her yönetici API çağrısında kullanıcı, aktif izin listesi ve AAL2 kontrol edilir. Kayıp MFA için Dashboard üzerinden, kimliği doğrulanmış yönetici kurtarma prosedürü kullanın; uygulamada MFA bypass endpoint'i yoktur.
7. İzni iptal etmek için ilgili `admin_users.active=false` yapın; sunucu bir sonraki istekte reddeder. Oturum/token süresi ve Auth ayarlarını kurum politikasına göre belirleyin.

### Bu test projesinin bakım komutları

Marketplace ortamı `.local/supabase-development.env` içine çekildi; yerel geliştirme `.env.local` dosyası korunur. CA sertifikası sağlayıcının HTTPS indirme adresinden `.local/supabase-ca.crt` içine alındı; bağlantıda CA ve hostname doğrulanır. Aşağıdaki komutlar env yolu, CA yolu ve **beklenen proje ref'ini** zorunlu tutar; farklı proje bağlantısını reddeder:

```sh
node scripts/migrate-supabase.mjs .local/supabase-development.env .local/supabase-ca.crt mxoktkgwmcntqxdifztf
node scripts/verify-supabase.mjs .local/supabase-development.env .local/supabase-ca.crt mxoktkgwmcntqxdifztf
```

Migration tek transaction ve checksum kaydıyla uygulanır; tekrar çalıştırılması mevcut migration'ı doğrular. Yönetilen servis testi gerçek veri kullanmaz; DB değişikliklerini rollback yapar, yüklediği sentetik dosyayı siler. Test scripti e-posta göndermez.

İlk yönetici kullanıcı ve aktif izin kaydı oluşturuldu; parola girişi/getUser/izin listesi doğrulandı. Kimlik bilgileri yalnız ignored `.local/supabase-admin.env` dosyasında, bulut uygulama anahtarları `.local/cloud-secrets.env` dosyasında bulunur; bunları Git'e veya sohbete aktarmayın. Yönetici için telefonla kişisel TOTP eşleştirmesi hâlâ gerekir. Henüz uygulama endpoint'leri eksik kritik servis/hukuki ayarlar yüzünden kapalıdır. `scripts/bootstrap-admin.mjs` yalnız yeni kurulumda `ADMIN_EMAIL` ile kullanılabilir; mevcut kullanıcı parolasını değiştirmez.

## Şifreleme ve production ayarları

`DATA_ENCRYPTION_KEY`, `TOKEN_SECRET`, `CRON_SECRET` için ayrı ayrı 32 rastgele baytın base64 çıktısını üretin:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Değerleri secret manager/hosting environment üzerinden ekleyin. Anahtarı kaybetmek şifreli başvuruları geri alınamaz hale getirir. Anahtarı yalnız DB yedeğiyle aynı yerde tutmayın. Anahtar rotasyonu otomatik değildir; eski anahtarla açıp yenisiyle yeniden şifreleyen, yedekli ve kontrollü bir bakım işlemi gerekir.

Canlı adaptör `APP_MODE=supabase` kullanır. `APP_URL=https://...`, gerçek aydınlatma dosyası yolu `PRIVACY_NOTICE_PATH`, sürüm, veri sorumlusu adı ve `LEGAL_REVIEW_APPROVED=true` dahil tüm kritik alanlar gerekir. Bu bayrak hukuki inceleme yapılmış olduğunu kendi başına ispatlamaz. Başvurular açılmadan önce [DEPLOY](DEPLOY.md) kapılarını tamamlayın.

## Resend: yöneticiye nasıl mail gider?

22 Ekim: ücretsiz Resend kaynağı oluşturuldu; preview/development'a bağlandı. Gönderici `Nostos Forms <basvuru@bildirim.lumoza.art>`, alıcı kullanıcının belirttiği yönetici e-postasıdır. Alan adı henüz doğrulanmadı, gerçek mail gönderilmedi. Gerekli DNS kayıtları [DNS_RECORDS](DNS_RECORDS.md) dosyasında.

1. Resend hesabında size ait gönderici alan adını doğrulayın; istenen DNS kayıtlarını yetkili DNS paneline girin. Rastgele veya size ait olmayan gönderici adresi kullanmayın.
2. Sunucu ortamına `RESEND_API_KEY`, doğrulanmış adresten `EMAIL_FROM` (ör. `Nostos Forms <basvuru@size-ait-alan-adi>`), hedef `ADMIN_EMAIL` ve yönetim bağlantısı için doğru `APP_URL` ekleyin. API anahtarını sohbete veya Git'e koymayın.
3. Yeni başvuru transaction'ı bir `notification_outbox` satırı oluşturur. Mail sadece referans, tarih, tür, durum ve yönetim bağlantısını içerir. Tam kimlik, ad/adres/telefon, belge ve imza içermez.
4. Zamanlayıcı aşağıdaki yetkili job'u dakikada bir çağırır. Uygulama bu görevi kendi kendine arka planda planlamaz; Node/hosting scheduler kurulmalıdır. Yalnız POST kabul edilir.

```http
POST https://uygulama-alaniniz/api/jobs
Authorization: Bearer <CRON_SECRET>
```

5. `/admin` detayındaki bildirim durumundan sonucu takip edin. Hata durumunda başvuru silinmez. En fazla 8 deneme, üstel gecikme, 23 saatlik otomatik tekrar sınırı ve her outbox ID'si için sabit Resend idempotency anahtarı vardır. 24 saatlik sağlayıcı dedup sınırını aşmamak için otomatik tekrar durur; belirsiz/eskimiş teslimleri operatör Resend kayıtlarıyla karşılaştırmalıdır. Körlemesine yeni outbox kaydı oluşturmayın.
6. İsteğe bağlı `SEND_APPLICANT_RECEIPT=true`, e-postası olan başvuru sahibine ayrı ve benzersiz bir alındı bildirimi kuyruğa ekler. Varsayılan kapalıdır. Bu pazarlama aboneliği değildir.

Yerel mod hiçbir durumda Resend çağırmaz. Yerel job çalıştırılırsa teslim `failed/DELIVERY_FAILED` olur; gönderilmiş gibi gösterilmez.

## Turnstile, tarama ve proxy

Turnstile widget'ına gerçek uygulama hostname'ini ekleyin. `TURNSTILE_SITE_KEY` istemciye gerekli public bilgidir; `TURNSTILE_SECRET_KEY` yalnız sunucuda kalır. Siteverify hostname ve `application` action kontrol edilir. Test anahtarlarını production'da kullanmayın.

Production'da belge/imza açılacaksa ayrıca `FILE_SCAN_URL` (HTTPS) ve `FILE_SCAN_TOKEN` zorunludur. Gateway, ham dosya baytlarını POST alıp yalnız tarama başarılı ve temizse `{"clean":true}` dönmelidir. Timeout, HTTP hata veya başka yanıt reddedilir. Bu projede tarama motoru/antivirüs hesabı kurulmadı.

Varsayılan rate limit tüm istekler için ortak kovadır. İstemci IP'sine göre ayırmak için, yalnız altyapının dışarıdan gelen değeri silip kendisinin yazdığı bir header varsa `TRUSTED_IP_HEADER` belirtin. Keyfi `X-Forwarded-For` değerine güvenmeyin. Reverse proxy ayrıca gövde boyutu, bağlantı ve istek limitlerini uygulamalıdır.

## İkametgâh belgesi

`RESIDENCE_DOCUMENT_ENABLED=true` yalnız PDF yükleme alanını açar. Varsayılan `false` değeridir. `RESIDENCE_DOCUMENT_REQUIRED=true` belgeyi zorunlu yapar ve ENABLED ayarının da açık olmasını gerektirir; varsayılan isteğe bağlıdır. Boyut sınırı `MAX_UPLOAD_MB` ile ortaktır. Production'da bu alan da hukuki onay ve çalışan antivirüs gateway gerektirir. Önizlemede dosya seçmek gerçek sunucuya yüklemek anlamına gelmez.

Yeni kurulumlarda tüm migration dosyalarını sırayla uygulayın; mevcut kurulumlarda `20261023084031_residence_document.sql` ek migration'ını uygulayın. İkametgâh dosyası private bucket'ta tutulur ve yönetici detayında yetkili indirme üzerinden açılır. Başvuru PDF'sinde belgenin yüklenme durumu gösterilir; belgenin sayfaları başvuru PDF'sine eklenmez.
