// database.js (Bağlantı fonksiyonlarını içerir)

require('dotenv').config(); 
const { MongoClient } = require('mongodb'); 

// .env dosyasından değişkenleri al
const uri = process.env.MONGO_URI; 
const dbName = "newsCuratorDB"; // Haber DB'sini kullan

if (!uri) {
    throw new Error("MONGO_URI ortam değişkeni ayarlanmamış. .env dosyanızı kontrol edin.");
}

const client = new MongoClient(uri);
let db; 

// --- BAĞLANTI FONKSİYONU ---
async function connectDB() {
    try {
        console.log("MongoDB Atlas'a bağlanılıyor...");
        await client.connect();
        db = client.db(dbName); 
        console.log(`MongoDB veritabanına başarıyla bağlandı: ${dbName}!`);

    } catch (error) {
        console.error("Veritabanı bağlantısı başarısız:", error.message);
        process.exit(1); 
    }
}

// --- TEMEL OPERASYONLAR ---

// Bir haber makalesi dizisini 'articles' koleksiyonuna kaydetme fonksiyonu
async function insertArticles(articles) {
    if (!db) {
        throw new Error("Veritabanı bağlı değil.");
    }
    const collection = db.collection('articles');

    const operations = articles.map(article => ({
        updateOne: {
            filter: { link: article.link },
            update: { $set: { ...article, fetchedAt: new Date() } },
            upsert: true
        }
    }));

    if (operations.length > 0) {
        try {
            const result = await collection.bulkWrite(operations);
            console.log(`[DB] Eklendi/Güncellendi: ${result.upsertedCount + result.modifiedCount} makale.`);
        } catch (error) {
            console.error("[DB HATA] Toplu yazma işlemi başarısız:", error.message);
        }
    }
}

// Frontend gösterimi için tüm kayıtlı makaleleri çekme fonksiyonu
async function getAllArticles() {
    if (!db) {
        throw new Error("Veritabanı bağlı değil.");
    }
    const collection = db.collection('articles');
    return await collection.find({}).sort({ pubDate: -1 }).toArray();
}

// --- "BAĞLANTILARIM" İÇİN FONKSİYONLAR ---

/**
 * 'links' koleksiyonuna yeni bir bağlantı ekler.
 * Yinelenen bağlantıları önlemek için upsert kullanır.
 */
async function addLink(title, link) {
    if (!db) {
        throw new Error("Veritabanı bağlı değil.");
    }
    const collection = db.collection('links');
    try {
        const result = await collection.updateOne(
            { link: link }, // Yinelenmeyi önlemek için bağlantıya göre filtrele
            { $set: { title: title, link: link, createdAt: new Date() } }, // Veriyi ayarla
            { upsert: true } // Yoksa ekle
        );
        if (result.upsertedCount > 0) {
            console.log(`[DB] Yeni bağlantı eklendi: ${title}`);
        } else {
            console.log(`[DB] Mevcut bağlantı güncellendi: ${title}`);
        }
    } catch (error) {
        console.error("[DB HATA] Bağlantı eklenemedi:", error.message);
        throw error; // server.js tarafından yakalanması için hatayı tekrar fırlat
    }
}

/**
 * 'links' koleksiyonundan tüm bağlantıları en yeniden eskiye doğru sıralı olarak alır.
 */
async function getAllLinks() {
    if (!db) {
        throw new Error("Veritabanı bağlı değil.");
    }
    const collection = db.collection('links');
    return await collection.find({}).sort({ createdAt: -1 }).toArray();
}


// --- DIŞA AKTARMALAR ---
module.exports = {
    connectDB,
    insertArticles,
    getAllArticles,
    addLink,
    getAllLinks
};