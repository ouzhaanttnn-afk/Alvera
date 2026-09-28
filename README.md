# Alvera Kuyumculuk

Alvera Kuyumculuk için geliştirilen yeni dijital vitrin.

## Deneyim
- Premium fildişi / koyu yeşil / şampanya altını görsel dil
- Responsive mobil ve masaüstü tasarım
- Canvas tabanlı hafif hero parçacık animasyonu
- CSS ile üretilmiş özgün mücevher görselleri
- Scroll reveal, tilt ve magnetic micro-interaction'lar
- Erişilebilir reduced-motion desteği
- Yerel SEO / JewelryStore structured data

## Canlı fiyatlar
`/api/prices` sunucu fonksiyonu Altınkaynak verisini referans alır. Veri doğrulanamazsa eski veya uydurma fiyat göstermek yerine fiyat alanını kapatır.

Kaynak: https://www.altinkaynak.com/canli-kurlar/altin

> Sitedeki piyasa değerleri referanstır; mağaza fiyatları ürün, işçilik ve piyasa koşullarına göre farklılık gösterebilir.

## Yayın
Vercel ile doğrudan deploy edilebilir. Statik arayüz + `api/prices.js` Node serverless function kullanır.
