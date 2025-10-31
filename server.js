// server.js (GÜNCELLENDİ: Kümeleme (cluster) kaldırıldı)

// 1. Modülleri içe aktar
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const basicAuth = require('express-basic-auth'); 
const aggregator = require('./aggregator');
const db = require('./database');
const curator = require('./curator');

// 2. Uygulamayı başlat ve portu ayarla
const app = express();
const PORT = process.env.PORT || 3000;


// --- MIDDLEWARE KURULUMU ---
app.use(bodyParser.json());
app.use(express.static('public')); // 'public' klasöründeki dosyaları sun

// --- Temel Kimlik Doğrulama Middleware ---
const adminUser = process.env.ADMIN_USER || 'admin';
const adminPass = process.env.ADMIN_PASSWORD;

if (!adminPass) {
    console.error("KRİTİK: ADMIN_PASSWORD ortam değişkeni ayarlanmamış. Yönetici paneline erişilemeyecek.");
}

const adminAuth = basicAuth({
    users: { [adminUser]: adminPass },
    challenge: true,
    unauthorizedResponse: 'Erişim Reddedildi. Lütfen kimlik bilgilerinizi kontrol edin.'
});

// --- API ROTALARI (Uç Noktalar) ---

// Kayıtlı tüm haber makalelerini çek
app.get('/api/news', async (req, res) => {
    console.log("--> /api/news için istek alındı");
    try {
        const articles = await db.getAllArticles();
        console.log(`--> DB'de ${articles.length} makale bulundu.`);
        res.json(articles);
    } catch (error) {
        console.error("!!! HATA (/api/news):", error);
        res.status(500).json({ error: 'Makaleler alınamadı.' });
    }
});

// Uç Nokta 1: YZ Metni Oluştur
app.post('/api/generate-text', async (req, res) => {
    const article = req.body;
    if (!article || !article.title) {
        return res.status(400).json({ error: 'Eksik makale verisi.' });
    }
    try {
        const curatedText = await curator.generateAiText(article);
        res.json(curatedText);
    } catch (error) {
        console.error("Metin oluşturma sırasında hata:", error);
        res.status(500).json({ error: 'Metin oluşturma başarısız.' });
    }
});

// Uç Nokta 2: Anahtar Kelimeleri Çıkar
app.post('/api/extract-keywords', async (req, res) => {
    const { headline, description } = req.body;
    if (!headline || !description) {
        return res.status(400).json({ error: 'Eksik başlık veya açıklama.' });
    }
    try {
        const keywords = await curator.extractSearchKeywords(headline, description);
        res.json({ keywords });
    } catch (error) {
        console.error("Anahtar kelime çıkarma sırasında hata:", error);
        res.status(500).json({ error: 'Anahtar kelime çıkarma başarısız.' });
    }
});

// Uç Nokta 3: Alternatif Anahtar Kelimeler Al
app.post('/api/get-alternative-keywords', async (req, res) => {
    const { headline, description, previousKeywords } = req.body;
    if (!headline || !description) {
        return res.status(400).json({ error: 'Eksik başlık veya açıklama.' });
    }
    const prevKeywordsArray = Array.isArray(previousKeywords) ? previousKeywords : [];
    try {
        const keywords = await curator.getAlternativeKeywords(headline, description, prevKeywordsArray);
        res.json({ keywords });
    } catch (error) {
        console.error("Alternatif anahtar kelime çıkarma sırasında hata:", error);
        res.status(500).json({ error: 'Alternatif anahtar kelime çıkarma başarısız.' });
    }
});


// Uç Nokta 4: Resim Ara
app.post('/api/search-images', async (req, res) => {
    const { query, startIndex } = req.body;
    if (!query) {
        return res.status(400).json({ error: 'Eksik sorgu.' });
    }
    const index = parseInt(startIndex, 10) || 0;
    try {
        const imagesData = await curator.searchForRelevantImages(query, index);
        res.json({ images: imagesData });
    } catch (error) {
        console.error("Resim arama sırasında hata:", error);
        res.status(500).json({ error: 'Resim arama başarısız.' });
    }
});

// Uç Nokta 5: İlgili Makaleleri Bul
app.post('/api/find-related-articles', async (req, res) => {
    const { title, source } = req.body;
    if (!title || !source) {
        return res.status(400).json({ error: 'Eksik başlık veya kaynak.' });
    }
    try {
        const relatedArticles = await curator.findRelatedWebArticles(title, source);
        res.json({ relatedArticles });
    } catch (error) {
        console.error("İlgili makale arama sırasında hata:", error);
        res.status(500).json({ error: 'İlgili makale arama başarısız.' });
    }
});

// Uç Nokta 6: Video Bul
app.post('/api/find-video', async (req, res) => {
    const { title, source } = req.body;
    if (!title || !source) {
        return res.status(400).json({ error: 'Eksik başlık veya kaynak.' });
    }
    try {
        const videoUrl = await curator.findRelatedVideo(title, source);
        res.json({ videoUrl });
    } catch (error) {
        console.error("Video arama sırasında hata:", error);
        res.status(500).json({ error: 'Video arama başarısız.' });
    }
});

// Basit Önizleme Resmi Oluşturma
app.post('/api/generate-simple-preview', async (req, res) => {
    const { imageUrl, overlayText } = req.body; 
    if (!imageUrl || !overlayText) {
        return res.status(400).json({ error: 'Önizleme için eksik veri.' });
    }
    try {
        // Bu fonksiyon artık bir buffer veya null döndürüyor
        const imageBuffer = await curator.generateSimplePreviewImage(imageUrl, overlayText); 
        
        if (imageBuffer) {
            // Doğru içerik tipini ayarla ve buffer'ı doğrudan gönder
            res.set('Content-Type', 'image/png');
            res.send(imageBuffer);
        } else {
            // Buffer null ise (oluşturma başarısız) 500 hatası gönder
            res.status(500).json({ error: 'Önizleme oluşturma sunucuda başarısız oldu.' });
        }
    } catch (error) {
        console.error("!!! HATA (/api/generate-simple-preview):", error);
        res.status(500).json({ error: 'Dahili sunucu hatası.' });
    }
});

// Sosyal Medya Paylaşımı (MOCK-UP)
app.post('/api/share', async (req, res) => {
    const { imagePath, caption, platform } = req.body;
    console.log(`\n*** MOCK PAYLAŞIM İSTEĞİ (${platform}) ***\n`);
    res.json({ success: true, message: `${platform} platformuna paylaşım simüle edildi!` });
});

// Yeni bir bağlantı ekle (yönetici panelinden)
app.post('/api/links/add', async (req, res) => {
    console.log("--> /api/links/add için istek alındı");
    const { title, link } = req.body;
    if (!title || !link) {
        return res.status(400).json({ success: false, error: 'Eksik başlık veya bağlantı.' });
    }
    try {
        await db.addLink(title, link);
        res.json({ success: true, message: 'Bağlantı eklendi!' });
    } catch (error) {
        console.error("!!! HATA (/api/links/add):", error);
        res.status(500).json({ success: false, error: 'Bağlantı eklenemedi.' });
    }
});

// Tüm bağlantıları al (herkese açık sayfa için)
app.get('/api/links/get', async (req, res) => {
    console.log("--> /api/links/get için istek alındı");
    try {
        const links = await db.getAllLinks();
        res.json(links);
    } catch (error) {
        console.error("!!! HATA (/api/links/get):", error);
        res.status(500).json({ error: 'Bağlantılar alınamadı.' });
    }
});

// --- SAYFA YÖNLENDİRME ---

// Herkese açık kök dizin: Herkese açık "link bio" sayfasını sunar
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'links.html'));
});

// Yönetici paneli: Parola korumalı özel küratör uygulamasını sunar
app.get('/admin', adminAuth, (req, res) => {
    if (!adminPass) {
        return res.status(500).send("Sunucu bir ADMIN_PASSWORD ile yapılandırılmamış. Erişim reddedildi.");
    }
    res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

// --- SUNUCU BAŞLATMA FONKSİYONU ---
// Bu fonksiyon artık tek bir işlem tarafından çalıştırılıyor
async function startApp() {
    try {
        await db.connectDB();
        console.log("Veritabanı bağlantısı başarılı.");

        app.listen(PORT,'0.0.0.0', () => {
            console.log(`Sunucu http://localhost:${PORT} adresinde çalışıyor`);
            
            // Tekrarlanan zamanlamayı başlat
            aggregator.startScheduler();
        });
    } catch (dbError) {
        console.error("Sunucu başlatılamadı:", dbError);
        process.exit(1);
    }
}

// --- SUNUCU BAŞLATMAYI TETİKLE ---
// Artık kümeleme mantığı yok, sadece uygulamayı çalıştır
startApp();