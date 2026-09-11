# AI Bilgi Asistani — Prototip

Sizin girdiginiz bilgilerden cevap veren basit web sitesi.

## Akis

Bilgi gir -> `bilgiler.json` dosyasinda saklanir -> Kullanici soru sorar ->
ilgili bilgiler bulunur -> OpenAI API'ye (soru + bilgiler) gonderilir ->
cevap bilgilere dayanarak uretilir.

## Kurulum (2 dakika)

1. Klasore girin:

```bash
cd ai-bilgi-asistani
```

2. OpenAI API anahtarinizi `.env` dosyasina yazin
(`.env.example` dosyasini kopyalayin):

```
OPENAI_API_KEY=sk-xxxx...
```

API anahtari: https://platform.openai.com/api-keys

3. Baslatin:

```bash
npm start
```

4. Tarayicida acin: http://localhost:3000

## API anahtari olmadan da calisir mi?

Evet. API anahtari yoksa site **yerel modda** calisir:
sorudaki kelimelerle eslesen bilgileri bulup ekrana getirir.
B Boylece akisin calisip calismadigini anahtar almadan da test edersiniz.
Anahtari ekleyince ayni akis ChatGPT zekasiyla cevap uretir.

## Sayfalar

- `/` — **müşteri ana sayfası:** sadece soru sorma (modern AI sohbet arayüzü, Lucide ikonlar, animasyonlu)
- `/admin` — **işletme paneli:** bilgi ekleme/silme (şifreli, varsayılan `admin123`)

- `server.js` — backend (bilgi kayit + OpenAI baglantisi)
- `public/index.html` — web arayuzu (bilgi ekleme + soru sorma)
- `bilgiler.json` — veritabani niyetine basit dosya (ileride gercek DB olur)
- `.env` — API anahtari (siz olusturun, git'e eklemeyin)
# ai-asistant
