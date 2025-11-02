// database.js (GÜNCELLENDİ: Koleksiyon adları projeye özel hale getirildi)

require('dotenv').config(); 
const { MongoClient, ObjectId } = require('mongodb'); // <-- ObjectId zaten mevcuttu

// .env dosyasından değişkenleri al
const uri = process.env.MONGO_URI; 
const dbName = "newsCuratorDB"; // Ana veritabanı adı

// --- İZOLASYON GÜNCELLEMESİ ---
// Koleksiyon adlarını bu projeye özel (Haberci) olarak ayarla
const ARTICLES_COLLECTION = 'haberci_articles';
const LINKS_COLLECTION = 'haberci_links';
// --- GÜNCELLEME SONU ---

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

// --- 'haberci_articles' KOLEKSİYONU OPERASYONLARI ---

// Bir haber makalesi dizisini 'haberci_articles' koleksiyonuna kaydetme fonksiyonu
async function insertArticles(articles) {
    if (!db) {
        throw new Error("Veritabanı bağlı değil.");
    }
    const collection = db.collection(ARTICLES_COLLECTION); // <-- Yeni adı kullan

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
            console.log(`[DB] Eklendi/Güncellendi: ${result.upsertedCount + result.modifiedCount} makale (${ARTICLES_COLLECTION}).`);
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
    const collection = db.collection(ARTICLES_COLLECTION); // <-- Yeni adı kullan
    return await collection.find({}).sort({ pubDate: -1 }).toArray();
}

// --- 'haberci_links' KOLEKSİYONU OPERASYONLARI ---

/**
 * 'haberci_links' koleksiyonuna yeni bir bağlantı ekler.
 */
async function addLink(title, link) {
    if (!db) {
        throw new Error("Veritabanı bağlı değil.");
    }
    const collection = db.collection(LINKS_COLLECTION); // <-- Yeni adı kullan
    try {
        const result = await collection.updateOne(
            { link: link }, 
            { $set: { title: title, link: link, createdAt: new Date() } },
            { upsert: true } 
        );
        if (result.upsertedCount > 0) {
            console.log(`[DB] Yeni bağlantı eklendi (${LINKS_COLLECTION}): ${title}`);
        } else {
            console.log(`[DB] Mevcut bağlantı güncellendi (${LINKS_COLLECTION}): ${title}`);
        }
    } catch (error) {
        console.error("[DB HATA] Bağlantı eklenemedi:", error.message);
        throw error; 
    }
}

/**
 * 'haberci_links' koleksiyonundan tüm bağlantıları alır.
 */
async function getAllLinks() {
    if (!db) {
        throw new Error("Veritabanı bağlı değil.");
    }
    const collection = db.collection(LINKS_COLLECTION); // <-- Yeni adı kullan
    return await collection.find({}).sort({ createdAt: -1 }).toArray();
}

/**
 * 'haberci_links' koleksiyonundan ID'ye göre bir linki siler.
 */
async function deleteLink(linkId) {
    if (!db) {
        throw new Error("Veritabanı bağlı değil.");
    }
    const collection = db.collection(LINKS_COLLECTION); // <-- Yeni adı kullan
    try {
        if (!ObjectId.isValid(linkId)) {
             console.error("Hata: Geçersiz Link ID formatı.");
             return { deletedCount: 0 };
        }
        const result = await collection.deleteOne({ _id: new ObjectId(linkId) });
        console.log(`[DB] Link silindi (${LINKS_COLLECTION}), silinen sayı: ${result.deletedCount}`);
        return result;
    } catch (error) {
        console.error("[DB HATA] Link silinemedi:", error.message);
        throw error;
    }
}


// --- DIŞA AKTARMALAR ---
module.exports = {
    connectDB,
    insertArticles,
    getAllArticles,
    addLink,
    getAllLinks,
    deleteLink
};