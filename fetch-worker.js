// fetch-worker.js
// Bu dosya ayrı bir iş parçacığında (thread) çalışır.

const { parentPort } = require('worker_threads');
const Parser = require('rss-parser');
const db = require('./database');

// --- Darboğazı önlemek için yardımcı fonksiyon ---
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const DELAY_PER_FEED_MS = 250; // Her akış arasında 250ms duraklama

// --- Tüm RSS çekme mantığı buradadır ---
const parser = new Parser({
    customFields: {
      item: [['media:content', 'media:content', {keepArray: false}]],
    }
});

// *** YENİ TÜRKÇE RSS AKIŞ LİSTESİ ***
const RSS_FEEDS_MASTER = [
  // --- 📰 Ana Haber ve Gündem ---
  { name: 'Anadolu Ajansı - Gündem', url: 'https://www.aa.com.tr/tr/rss/default?cat=guncel' },
  { name: 'NTV - Son Dakika', url: 'https://www.ntv.com.tr/son-dakika.rss' },
  { name: 'Hürriyet - Anasayfa', url: 'https://www.hurriyet.com.tr/rss/anasayfa' },
  { name: 'Milliyet - Gündem', url: 'https://www.milliyet.com.tr/rss/rssnew/gundemrss.xml' },
  { name: 'Sabah - Gündem', url: 'https://www.sabah.com.tr/rss/gundem.xml' },
  { name: 'Habertürk - Gündem', url: 'https://www.haberturk.com/rss/gundem.xml' },
  { name: 'Cumhuriyet - Gündem', url: 'https://www.cumhuriyet.com.tr/rss/gundem.xml' },
  { name: 'TRT Haber - Gündem', url: 'https://www.trthaber.com/xml_kategori.php?kategori=1' },

  // --- 💼 Ekonomi & Finans ---
  { name: 'Bloomberg HT', url: 'https://www.bloomberght.com/rss' },
  { name: 'Dünya Gazetesi - Gündem', url: 'https://www.dunya.com/rss/gundem.xml' },
  { name: 'Para (Hürriyet)', url: 'https://www.hurriyet.com.tr/rss/ekonomi' },
  { name: 'NTV - Ekonomi', url: 'https://www.ntv.com.tr/ekonomi.rss' },
  { name: 'Sabah - Ekonomi', url: 'https://www.sabah.com.tr/rss/ekonomi.xml' },

  // --- 💻 Teknoloji & Bilim ---
  { name: 'Webrazzi', url: 'https://webrazzi.com/feed/' },
  { name: 'ShiftDelete.Net', url: 'https://shiftdelete.net/feed' },
  { name: 'HardwareHaber (DonanımHaber)', url: 'https://www.donanimhaber.com/rss/tum/' },
  { name: 'CHIP Online', url: 'https://www.chip.com.tr/rss/' },
  { name: 'TeknoSeyir', url: 'https://teknoseyir.com/feed' },
  { name: 'NTV - Teknoloji', url: 'https://www.ntv.com.tr/teknoloji.rss' },
  { name: 'Anadolu Ajansı - Bilim/Teknoloji', url: 'https://www.aa.com.tr/tr/rss/default?cat=bilim-teknoloji' },
  
  // --- ⚽ Spor ---
  { name: 'Fanatik', url: 'https_www.fanatik.com.tr/rss' }, // URL'de yazım hatası var gibi görünüyor, 'https://' olmalı
  { name: 'Fotomaç - Anasayfa', url: 'https://www.fotomac.com.tr/rss/anasayfa.xml' },
  { name: 'NTV Spor', url: 'https://www.ntv.com.tr/spor.rss' },
  { name: 'TRT Spor', url: 'https://www.trthaber.com/xml_kategori.php?kategori=4' },
  { name: 'Sabah - Spor', url: 'https://www.sabah.com.tr/rss/spor.xml' },

  // --- 🌍 Dünya ---
  { name: 'Anadolu Ajansı - Dünya', url: 'https://www.aa.com.tr/tr/rss/default?cat=dunya' },
  { name: 'NTV - Dünya', url: 'https://www.ntv.com.tr/dunya.rss' },
  { name: 'Habertürk - Dünya', url: 'https.haberturk.com/rss/dunya.xml' },
  { name: 'Hürriyet - Dünya', url: 'https://www.hurriyet.com.tr/rss/dunya' },

  // --- 🎨 Kültür, Yaşam & Sanat ---
  { name: 'NTV - Yaşam', url: 'https://www.ntv.com.tr/yasam.rss' },
  { name: 'Hürriyet - Kelebek', url: 'https://www.hurriyet.com.tr/rss/kelebek' },
  { name: 'Sabah - Günaydın', url: 'https://www.sabah.com.tr/rss/gunaydin.xml' },
  { name: 'Milliyet - Kültür Sanat', url: 'https://www.milliyet.com.tr/rss/rssnew/kultursanatrss.xml' },
];


async function fetchAndProcessNews() {
    console.log(`\n[Worker] --- Haber çekme işlemi başlıyor: ${new Date().toLocaleTimeString()} ---`);
    let collectedArticles = [];
    let feedCount = 0;
    const totalFeeds = RSS_FEEDS_MASTER.length;

    for (const feed of RSS_FEEDS_MASTER) {
        feedCount++;
        console.log(`[Worker] Akış çekiliyor ${feedCount}/${totalFeeds}: ${feed.name}`);
        try {
            // *** GEÇİCİ DÜZELTME: Hatalı URL'leri düzelt ***
            let feedUrl = feed.url;
            if (feedUrl.startsWith('httpss://')) {
                feedUrl = feedUrl.replace('httpss://', 'https://');
            }
            if (feedUrl.startsWith('https_www')) {
                feedUrl = feedUrl.replace('https_www', 'https://www.');
            }
            if (feedUrl.startsWith('https.haberturk')) {
                feedUrl = feedUrl.replace('https.haberturk', 'https://www.haberturk');
            }

            let rss = await parser.parseURL(feedUrl); // Düzeltilmiş URL'i kullan

            const processedItems = rss.items.map(item => {
                // Orijinal resim URL'ini bul
                let originalImageUrl = null;
                if (item.enclosure && item.enclosure.url && item.enclosure.type.startsWith('image')) {
                    originalImageUrl = item.enclosure.url;
                } else if (item['media:content'] && item['media:content'].$.url) {
                    originalImageUrl = item['media:content'].$.url;
                }

                return {
                    source: feed.name,
                    title: item.title,
                    link: item.link,
                    pubDate: item.pubDate ? new Date(item.pubDate) : new Date(),
                    originalImageUrl: originalImageUrl 
                };
            }).slice(0, 5); // En son 5 haberi al

            collectedArticles.push(...processedItems);
        } catch (error) {
            // Sadece yaygın olmayan hataları logla
            if (!error.message.includes('Status code 404') && 
                !error.message.includes('Status code 403') &&
                !error.message.includes('Status code 406') &&
                !error.message.includes('Status code 405') &&
                !error.message.includes('Status code 429') &&
                !error.message.includes('ENOTFOUND') &&
                !error.message.includes('socket hang up') &&
                !error.message.includes('Invalid character') &&
                !error.message.includes('Protocol "httpss:"')
                ) {
                console.error(`[Worker HATA] Akış çekilemedi (${feed.name}): ${error.message}`);
            }
        }

        // CPU/ağ yükünü yumuşatmak için her akıştan sonra kısa bir süre bekle
        await delay(DELAY_PER_FEED_MS);
    }
    
    collectedArticles.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());
    
    if (collectedArticles.length > 0) {
        // Sona eklenen toplu yazma işlemi verimli ve sorunsuz.
        await db.insertArticles(collectedArticles); 
    }
    
    console.log(`[Worker] Toplam ${collectedArticles.length} öğe işlendi.`);
    console.log('[Worker] --- Haber çekme işlemi tamamlandı ---');

    return collectedArticles.length;
}

// Ana worker fonksiyonu
const runWorker = async () => {
    try {
        // *Worker içinde* DB'ye bağlan
        await db.connectDB();
        console.log("[Worker] Veritabanı bağlantısı başarılı.");
        const count = await fetchAndProcessNews();
        // Ana thread'e başarı mesajı gönder
        parentPort.postMessage({ status: 'done', count: count });
    } catch (error) {
        console.error("[Worker KRİTİK HATA]", error);
        parentPort.postMessage({ status: 'error', error: error.message });
    }
};

// İşlemi başlat
runWorker();