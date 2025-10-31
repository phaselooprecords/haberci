// aggregator.js (GÜNCELLENDİ: Artık bir Worker Thread kullanıyor)

const cron = require('cron');
const { Worker } = require('worker_threads');
const path = require('path');
const db = require('./database'); // getNews için hala gerekli

// --- HABERLERİ ÇEKMEK VE KAYDETMEK İÇİN ANA FONKSİYON ---
// Bu fonksiyon artık sadece bir worker oluşturup yönetiyor
function runFetchInWorker() {
    console.log('[Aggregator] Haber çekme için worker thread oluşturuluyor...');
    
    // Yeni bir worker oluştur
    const worker = new Worker(path.resolve(__dirname, 'fetch-worker.js'));

    // Worker'dan gelen mesajları dinle
    worker.on('message', (message) => {
        if (message.status === 'done') {
            console.log(`[Aggregator] Worker tamamlandı, ${message.count} makale işlendi.`);
        } else if (message.status === 'error') {
            console.error(`[Aggregator] Worker bir hatayla karşılaştı: ${message.error}`);
        }
    });

    // Worker'ın kendisinden gelen hataları dinle
    worker.on('error', (error) => {
        console.error('[Aggregator] Worker thread hatası:', error);
    });

    // Worker sonlandığında dinle
    worker.on('exit', (code) => {
        if (code !== 0) {
            console.error(`[Aggregator] Worker ${code} çıkış koduyla durdu`);
        }
    });
}

// --- CRON JOB KURULUMU ---
const NEWS_CRON_PATTERN = '0 */2 * * *'; // Her 2 saatte bir çalışır

// Cron job artık worker fonksiyonunu çağırıyor
const newsJob = new cron.CronJob(NEWS_CRON_PATTERN, runFetchInWorker, null, false, 'UTC');

// --- DIŞA AKTARMALAR ---
module.exports = {
    startScheduler: () => {
        newsJob.start();
        console.log(`[Scheduler] RSS görevi şu zamanlamayla kuruldu: ${NEWS_CRON_PATTERN}`);
        
        // İlk çalıştırmayı tetikle
        // Bu artık güvenli çünkü arka planda çalışıyor
        console.log("[Scheduler] İlk arka plan çekme işlemi tetikleniyor...");
        runFetchInWorker();
    },
    runFetch: runFetchInWorker, // Worker tabanlı fonksiyonu dışa aktar
    getNews: db.getAllArticles // Bu aynı kalır
};