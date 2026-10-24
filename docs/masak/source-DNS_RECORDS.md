# Alvera alan adı ve e-posta DNS kurulumu

Güncel hedef: **alverakuyumculuk.com**. lumoza.art üzerinde işlem yapılmayacak. Yetkili nameserver'lar ns51.domaincontrol.com ve ns52.domaincontrol.com; DNS GoDaddy tarafında yönetiliyor.

## Form

Vercel projesine alan adı eklendi. Vercel'in bu alan adı için önerdiği A kaydı: `@ → 76.76.21.21`. Mevcut A kayıtları GoDaddy park IP'leri; DNS değişikliği henüz yapılmadı. Nameserver veya MX değişikliği gerekmiyor. Mevcut diğer kayıtları koruyun. DNS doğrulaması ve TLS sertifikası tamamlanmadan önizlemeye alias ataması yapılamadı; alan adı henüz formu açıyor kabul edilmemelidir.

## Bildirim e-postası

Gönderici: **Alvera Form <basvuru@bildirim.alverakuyumculuk.com>**. Hedef yönetici e-postası sunucu ortamındaki ADMIN_EMAIL değeridir. Aşağıdaki adlar GoDaddy'de kök alan adına göre relatif host adlarıdır.

| Tür | Host | Değer | Öncelik |
| --- | --- | --- | --- |
| TXT | resend._domainkey.bildirim | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCzMqOOdvYbFERh54ZKzFGXR4jFFwMujyAdmSOaVEhx8JgBkF7s3a1jwMajxXfMfWtxpNfYyphuLHu+n3rUXW+OKtCw+JYGC8uEIsLTuvyr2yu1VohVt3BYE3UcXuk5sh/N3hdF+qMnOuPWeeum0BQz5VIlS4wyf7vKVLD8Axg4LQIDAQAB` | — |
| MX | send.bildirim | `feedback-smtp.eu-west-1.amazonses.com` | 10 |
| TXT | send.bildirim | `v=spf1 include:amazonses.com ~all` | — |
| CNAME | rsend.bildirim | `send.forge.rmta.net` | — |

Resend kimliği: `313ceba5-b334-4390-8d22-4d785901113e`; son durum: `not_started`. SPF/MX kayıtları send.bildirim alt alanına aittir; kök alan adının e-posta kayıtlarının üzerine yazılmaz. Açılma ve tıklama izleme kapalıdır.

Kayıtları ekledikten sonra Resend doğrulamasını başlatın ve verified durumunu bekleyin. Yalnız sentetik bir başvuruyla hedef Gmail'e gerçek teslimi kontrol edin. Şu ana kadar bildirim gönderilmedi.
