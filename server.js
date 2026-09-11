// AI Bilgi Asistani — Prototip backend
// Kurulum gerektirmez (Node.js 18+ yeterli, harici paket yok).
// Calistirma: npm start  ->  http://localhost:3000

const http = require("http");
const fs = require("fs");
const path = require("path");

// ---- .env dosyasini oku (paketsiz, basit) ----
(function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
})();

const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, "bilgiler.json");
const PUBLIC_DIR = path.join(__dirname, "public");

// ---- Basit "veritabani": JSON dosyasi ----
function bilgileriOku() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  } catch {
    return [];
  }
}
function bilgileriYaz(liste) {
  fs.writeFileSync(DB_PATH, JSON.stringify(liste, null, 2), "utf8");
}

// ---- Soruyla ilgili bilgileri bul (kelime ortusmesi) ----
// Amac: tum veriyi degil, soruya en uygun ilk 5 bilgiyi ChatGPT'ye gondermek.
function ilgiliBilgileriBul(soru, bilgiler, limit = 5) {
  const soruKelimeleri = soru
    .toLocaleLowerCase("tr")
    .replace(/[^a-zçğıöşü0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
  if (!soruKelimeleri.length) return bilgiler.slice(0, limit);

  const skorlu = bilgiler.map((b) => {
    const metin = b.text.toLocaleLowerCase("tr");
    let skor = 0;
    for (const k of soruKelimeleri) if (metin.includes(k)) skor++;
    return { b, skor };
  });
  skorlu.sort((x, y) => y.skor - x.skor);
  // Hic eslesme yoksa ilk kayitlari gonder (model "bilgi yok" diyebilsin)
  return skorlu.slice(0, limit).map((s) => s.b);
}

// ---- ChatGPT'ye sor (bilgiler + soru birlikte gider) ----
async function chatGptIleCevapla(soru, ilgiliBilgiler) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.includes("buraya")) return null; // yerel moda dus

  const bilgiMetni = ilgiliBilgiler
    .map((b, i) => `Bilgi ${i + 1}: ${b.text}`)
    .join("\n");

  const systemPrompt =
    "Sen bir bilgi asistanisin. SADECE asagida verilen BILGILER'e dayanarak cevap ver. " +
    "Bilgilerde cevabi yoksa bunu acikca soyle ve tahmin yurutme, genel bilginden ekleme yapma. " +
    "Cevabin Turkce, kisa ve net olsun.";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `BILGILER:\n${bilgiMetni || "(henuz hic bilgi girilmemis)"}\n\nSORU: ${soru}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenAI hatasi (${res.status}): ${txt.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.choices[0].message.content.trim();
}

// ---- Yerel mod (API anahtari yokken akisi test etmek icin) ----
function yerelCevap(soru, ilgiliBilgiler, tumSayi) {
  if (!tumSayi)
    return "Henuz hic bilgi girilmemis. Once sol taraftan bilgi ekleyin.";
  const eslesen = ilgiliBilgiler.filter(
    (b) =>
      b.text
        .toLocaleLowerCase("tr")
        .split(/\s+/)
        .some((w) => w.length > 2 && soru.toLocaleLowerCase("tr").includes(w)) ||
      soru
        .toLocaleLowerCase("tr")
        .split(/\s+/)
        .some((w) => w.length > 2 && b.text.toLocaleLowerCase("tr").includes(w))
  );
  const liste = (eslesen.length ? eslesen : ilgiliBilgiler)
    .map((b) => `• ${b.text}`)
    .join("\n");
  return (
    `(Yerel mod — OpenAI anahtari tanimli degil, ChatGPT devrede degil.)\n\n` +
    `Sorunuzla ilgili ${eslesen.length || ilgiliBilgiler.length} kayit bulundu:\n${liste}\n\n` +
    `API anahtarini .env dosyasina ekleyince bu cevap ChatGPT tarafindan cumle halinde uretilecek.`
  );
}

// ---- HTTP yardimcilari ----
function json(res, kod, obj) {
  res.writeHead(kod, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}
function govdeOku(req) {
  return new Promise((resolve, reject) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => {
      try {
        resolve(d ? JSON.parse(d) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}
function dosyaSun(res, dosyaYolu) {
  const ext = path.extname(dosyaYolu);
  const tipler = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript",
    ".css": "text/css",
  };
  fs.readFile(dosyaYolu, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Bulunamadi");
      return;
    }
    res.writeHead(200, { "Content-Type": tipler[ext] || "text/plain" });
    res.end(data);
  });
}

// ---- Sunucu ----
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const yol = url.pathname;

  // 1) Tum bilgileri getir
  if (yol === "/api/bilgiler" && req.method === "GET") {
    return json(res, 200, { bilgiler: bilgileriOku() });
  }

  // 2) Yeni bilgi ekle
  if (yol === "/api/bilgiler" && req.method === "POST") {
    try {
      const { text } = await govdeOku(req);
      if (!text || !text.trim())
        return json(res, 400, { hata: "Bilgi metni bos olamaz." });
      const liste = bilgileriOku();
      const kayit = { id: String(Date.now()), text: text.trim(), tarih: new Date().toISOString() };
      liste.unshift(kayit);
      bilgileriYaz(liste);
      return json(res, 201, { kayit, toplam: liste.length });
    } catch {
      return json(res, 400, { hata: "Gecersiz istek." });
    }
  }

  // 2b) Bilgi guncelle (duzenleme)
  if (yol.startsWith("/api/bilgiler/") && req.method === "PUT") {
    try {
      const id = yol.split("/").pop();
      const { text, title } = await govdeOku(req);
      if (!text || !text.trim())
        return json(res, 400, { hata: "Bilgi metni bos olamaz." });
      const liste = bilgileriOku();
      const kayit = liste.find((b) => b.id === id);
      if (!kayit) return json(res, 404, { hata: "Kayit bulunamadi." });
      kayit.text = text.trim();
      if (title !== undefined) kayit.title = title;
      bilgileriYaz(liste);
      return json(res, 200, { kayit });
    } catch {
      return json(res, 400, { hata: "Gecersiz istek." });
    }
  }
  if (yol.startsWith("/api/bilgiler/") && req.method === "DELETE") {
    const id = yol.split("/").pop();
    const kalan = bilgileriOku().filter((b) => b.id !== id);
    bilgileriYaz(kalan);
    return json(res, 200, { toplam: kalan.length });
  }

  // 4) Soru sor -> ChatGPT (veya yerel mod)
  if (yol === "/api/sor" && req.method === "POST") {
    try {
      const { soru } = await govdeOku(req);
      if (!soru || !soru.trim())
        return json(res, 400, { hata: "Soru bos olamaz." });
      const tumu = bilgileriOku();
      const ilgili = ilgiliBilgileriBul(soru, tumu);

      try {
        const aiCevap = await chatGptIleCevapla(soru, ilgili);
        if (aiCevap) {
          return json(res, 200, {
            cevap: aiCevap,
            mod: "chatgpt",
            kullanilanBilgiSayisi: ilgili.length,
          });
        }
      } catch (e) {
        return json(res, 502, { hata: e.message, mod: "hata" });
      }
      // API anahtari yoksa yerel mod
      return json(res, 200, {
        cevap: yerelCevap(soru, ilgili, tumu.length),
        mod: "yerel",
        kullanilanBilgiSayisi: ilgili.length,
      });
    } catch {
      return json(res, 400, { hata: "Gecersiz istek." });
    }
  }

  // 5) Baglanti durumu (anahtar tanimli mi?)
  if (yol === "/api/durum" && req.method === "GET") {
    const k = process.env.OPENAI_API_KEY || "";
    return json(res, 200, {
      chatgptBagli: Boolean(k && !k.includes("buraya")),
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    });
  }

  // 6) Arayuz dosyalari
  if (yol === "/" || yol === "/index.html") {
    return dosyaSun(res, path.join(PUBLIC_DIR, "index.html"));
  }
  if (yol === "/admin" || yol === "/admin.html") {
    return dosyaSun(res, path.join(PUBLIC_DIR, "admin.html"));
  }
  const statik = path.join(PUBLIC_DIR, decodeURIComponent(yol.slice(1)));
  if (yol !== "/" && fs.existsSync(statik) && fs.statSync(statik).isFile()) {
    return dosyaSun(res, statik);
  }
  return json(res, 404, { hata: "Bulunamadi." });
});

server.listen(PORT, () =>
  console.log(`Prototip calisiyor: http://localhost:${PORT}`)
);
