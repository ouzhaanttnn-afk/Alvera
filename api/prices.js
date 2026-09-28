const LEGACY_URL = "https://www.altinkaynak.com/Altin/Kur/Guncel";
const MODERN_URL = "https://www.altinkaynak.com/canli-kurlar/altin";

const TARGETS = [
  ["Has", "Has Altın"],
  ["Gram Altın", "Gram Altın"],
  ["Çeyrek", "Çeyrek Altın"],
  ["Yarım", "Yarım Altın"],
  ["Teklik", "Tam Altın"],
  ["Ata Cumhuriyet", "Ata Cumhuriyet"]
];

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&ccedil;/gi, "ç")
    .replace(/&Ccedil;/gi, "Ç")
    .replace(/&uuml;/gi, "ü")
    .replace(/&Uuml;/gi, "Ü")
    .replace(/&ouml;/gi, "ö")
    .replace(/&Ouml;/gi, "Ö")
    .replace(/&[a-z0-9#]+;/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function asNumber(value) {
  const n = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function parseLegacy(html) {
  const text = stripHtml(html);
  const prices = [];

  for (const [needle, label] of TARGETS) {
    const index = text.indexOf(needle);
    if (index < 0) continue;
    const chunk = text.slice(index + needle.length, index + needle.length + 240);
    const matches = [...chunk.matchAll(/-?\d{1,3}(?:\.\d{3})*,\d{2}/g)]
      .map(m => m[0])
      .filter(v => Math.abs(asNumber(v)) > 100);

    if (matches.length >= 2) {
      prices.push({ name: label, buy: matches[0], sell: matches[1] });
    }
  }

  const updated =
    text.match(/Son Güncellenme\s*:\s*([0-9.]+\s+[0-9:]+)/i)?.[1] || null;

  return { prices, updated };
}

function parseModern(html) {
  const text = stripHtml(html);
  const modernTargets = [
    ["Has", "Has Altın"],
    ["Gram Altın", "Gram Altın"],
    ["Çeyrek Yeni", "Çeyrek Altın"],
    ["Yarım Yeni", "Yarım Altın"],
    ["Teklik Yeni", "Tam Altın"],
    ["Ata Cumhuriyet", "Ata Cumhuriyet"]
  ];
  const prices = [];

  for (const [needle, label] of modernTargets) {
    const index = text.indexOf(needle);
    if (index < 0) continue;
    const chunk = text.slice(index + needle.length, index + needle.length + 190);
    const matches = [...chunk.matchAll(/\d{1,3}(?:\.\d{3})*,\d{2}/g)]
      .map(m => m[0])
      .filter(v => asNumber(v) > 100);

    if (matches.length >= 2) {
      prices.push({ name: label, buy: matches[0], sell: matches[1] });
    }
  }
  return { prices, updated: null };
}

async function getHtml(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; AlveraKuyumculuk/1.0; +https://github.com/ouzhaanttnn-afk/Alvera)",
      "Accept": "text/html,application/xhtml+xml"
    },
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Altinkaynak HTTP ${response.status}`);
  return response.text();
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  try {
    let result = parseLegacy(await getHtml(LEGACY_URL));

    if (result.prices.length < 4) {
      try {
        const fallback = parseModern(await getHtml(MODERN_URL));
        if (fallback.prices.length > result.prices.length) result = fallback;
      } catch (_) {}
    }

    if (result.prices.length < 3) throw new Error("Altınkaynak verisi ayrıştırılamadı");

    res.status(200).json({
      source: "Altınkaynak",
      sourceUrl: MODERN_URL,
      updated: result.updated,
      fetchedAt: new Date().toISOString(),
      prices: result.prices
    });
  } catch (error) {
    res.status(503).json({
      error: "Canlı Altınkaynak verisine şu an ulaşılamıyor.",
      source: "Altınkaynak"
    });
  }
};