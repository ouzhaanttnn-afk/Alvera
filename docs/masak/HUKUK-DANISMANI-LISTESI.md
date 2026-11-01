# Aydınlatma metni: doldurulacaklar ve hukuk danışmanı listesi

**Durum: TASLAK. Yayına hazır değildir ve hukuki görüş yerine geçmez.**
Metin: `legal/aydinlatma-metni.txt`. İçinde doldurulmamış `[[DOLDURUN: …]]` işareti kaldığı sürece uygulama canlıda
başvuru kabul etmez (formu "Başvurular henüz açılmadı" olarak gösterir). Bu davranış hem birim testiyle hem üretim
modunda sunucu başlatılarak doğrulandı.

## Devreye alma sırası

1. `[[DOLDURUN: …]]` işaretlerini doldurun (aşağıdaki liste).
2. Hukuk danışmanı metni ve aşağıdaki soruları inceler.
3. Vercel ortam değişkenlerini girin (gizli anahtarları sohbete veya Git'e yazmayın):
   - `PRIVACY_NOTICE_PATH=./legal/aydinlatma-metni.txt`
   - `PRIVACY_NOTICE_VERSION` (örn. `2026-11-v1`; metin her değiştiğinde yeni sürüm verin)
   - `DATA_CONTROLLER_NAME` (veri sorumlusu unvanı)
   - `LEGAL_REVIEW_APPROVED=true` — **yalnızca** hukuki onaydan sonra.
4. Metin değişirse sürümü artırın; başvuru kaydında hangi sürümün gösterildiği saklanır.

## Doldurulacak yerler

| Bölüm | Ne yazılacak |
|---|---|
| Üst | Yürürlük (yayın) tarihi |
| 1 | Ticari unvan veya gerçek kişi adı soyadı |
| 1 | Vergi kimlik numarası |
| 1 | KEP adresi (yoksa "yoktur") |
| 5 | Kullanılan hizmet sağlayıcılar (şu an: Supabase, Vercel, Resend, Cloudflare) |
| 5 | Yurt dışı aktarım: sistemlerin bulunduğu ülke/bölge ve dayanılan güvence |
| 7 | Saklama süresi (gün) ve işleme dönüşen başvurular için süre |

İletişim bilgileri (adres, telefon, e-posta) sitede yayımlananlarla aynıdır; e-posta adresini (`alverakuyumculuk@gmail.com`)
değiştirmek isterseniz metni ve testi birlikte güncelleyin.

## Hukuk danışmanına sorular

1. **Veri sorumlusu** kim: şahıs işletmesi mi, şirket mi? Unvan ve iletişim bilgileri doğru mu?
2. **Hukuki sebep eşlemesi** (KVKK md. 5/2 bent a, ç, c, f, e) doğru mu? Özellikle başvurunun değerlendirilmesi amacı için "bent c" yeterli mi?
3. **Kapsam ve veri azaltma:** Bu form her müşteriden mi, yoksa yalnızca kimlik tespiti gereken durumlarda (eşik üstü işlem, sürekli iş ilişkisi, şüphe hâli; Tedbirler Yön. md. 5/1) mı kullanılacak? Gerekmeyen durumda kimlik numarası toplamak veri azaltma ilkesine aykırı olur mu?
4. **"Satış tutarı" alanı:** Müşteri size satış yaptığında da (alış işlemi) geçerli mi? Alanın adı "işlem tutarı" olmalı mı?
5. **Saklama süresi çelişkisi:** Form, başvuruyu varsayılan 365 gün sonra *silinmek üzere işaretliyor* (`RETENTION_DAYS`); ancak işleme dönüşen kayıtlar için 5549 sayılı Kanun md. 8 sekiz yıl öngörüyor. İşlem kayıtları nerede ve hangi süreyle tutulacak? Metindeki 7. bölüm buna göre netleştirilmeli.
6. **Yurt dışı aktarım (KVKK md. 9, 7499 sayılı Kanun ile değişik):** Supabase, Vercel, Resend ve Cloudflare sistemleri yurt dışındadır. Yeterlilik kararı yoksa uygun güvence (standart sözleşme) ve sözleşmenin imzasından itibaren **5 iş günü içinde Kurum'a bildirim** gerekir. Hangi bölgede kurulacak, kim imzalayacak, bildirim kim yapacak?
7. **Belge toplama (kimlik fotoğrafı, ikametgâh, imza)** açılırsa: kimlik görüntüsünde özel nitelikli veri (yüz fotoğrafı, eski kimliklerde din bilgisi) olabilir. Tedbirler Yön. md. 6/2'ye göre belge kopyası *veya* bilgilerin kaydı yeterli olduğundan, ilk sürüm belgeler **kapalı** açılabilir mi?
8. **VERBİS:** Sicile kayıt yükümlülüğü veya muafiyet durumu nedir?
9. **Veri işleyen sözleşmeleri** (Supabase, Vercel, Resend, Cloudflare), KVKK md. 12 teknik/idari tedbirler ve veri ihlali bildirim süreci kim tarafından yürütülecek?
10. **ŞİB gizliliği:** Metindeki "mevzuattaki gizlilik hükümleri nedeniyle size bilgi verilemeyebilir" ifadesi (5549 md. 4/2) yeterli ve doğru mu?
11. **Onay dili:** Formdaki "Aydınlatma metnini okudum. Bu beyan, açık rıza onayı değildir." kutusu ve kimlik adımındaki bilgi notu (kodda `HUKUK TEYİDİ` ile işaretli) Kurul'un 2026/347 sayılı ilke kararına uygun mu?

## Kaynaklar ve doğrulama durumu

Resmî metinlere (kvkk.gov.tr, mevzuat.gov.tr, Resmî Gazete) bu çalışmada doğrudan erişilemedi; aşağıdakiler ikincil kaynaklardır
ve **resmî metinden teyit edilmelidir**.

- Aydınlatma Tebliği (RG 10.03.2018, 30356) asgari unsurları: [alomaliye.com](https://www.alomaliye.com/2018/03/10/aydinlatma-yukumlulugu/amp/)
- Kurul İlke Kararı 2026/347 (18.02.2026; RG 24.03.2026, 33203): açık rıza ve aydınlatma metni ayrı olmalı, "okudum ve kabul ediyorum" yerine bilgilendirme teyidi, başka firmanın metninin birebir kopyalanması yasak: [alomaliye.com haberi](https://www.alomaliye.com/2026/03/24/kvkkdan-yeni-ilke-karari-acik-riza-metni-ile-aydinlatma-metni-artik-ayri-duzenlenmeli/)
- KVKK md. 9 (7499 ile değişik), standart sözleşme ve 5 iş günü bildirim: [cottgroup.com](https://cottgroup.com/tr/blog/kvkk-gdpr/item/standart-sozlesme-bildirim-yukumlulugu-ve-yaptirimlari)
- 5549 sayılı Kanun md. 4/2 ve md. 8, Tedbirler Yönetmeliği md. 4/1-k, 5/1, 6/2, 46: `docs/masak-raporu/MEVZUAT.md` (MASAK Raporu dalı, PR #1), mevzuat.gov.tr okumasına dayanır.
- Kuyumcuya özgü hazır bir aydınlatma metni şablonu bulunamadı. Metin Tebliğ'in yapısına ve formun gerçek veri akışına göre yazıldı;
  başka bir veri sorumlusunun metninden kopyalanmadı.
- Metindeki veri alanları formun kaynak kodundan (`src/lib/types.ts`) çıkarıldı; `tests/privacy-notice.test.ts` forma yeni alan
  eklenirse metin güncellenene kadar başarısız olur.
