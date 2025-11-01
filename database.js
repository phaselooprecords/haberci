// database.js (GÜNCELLENDİ: Link silme fonksiyonu eklendi)

require('dotenv').config(); 
const { MongoClient, ObjectId } = require('mongodb'); // <-- ObjectId eklendi

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

// --- TEMEL OPERASYONLAR ('articles' koleksiyonu) ---

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

// --- "BAĞLANTILARIM" İÇİN FONKSİYONLAR ('links' koleksiyonu) ---

/**
 * 'links' koleksiyonuna yeni bir bağlantı ekler.
 */
async function addLink(title, link) {
    if (!db) {
        throw new Error("Veritabanı bağlı değil.");
    }
    const collection = db.collection('links');
    try {
        const result = await collection.updateOne(
            { link: link }, 
            { $set: { title: title, link: link, createdAt: new Date() } },
            { upsert: true } 
        );
        if (result.upsertedCount > 0) {
            console.log(`[DB] Yeni bağlantı eklendi: ${title}`);
        } else {
            console.log(`[DB] Mevcut bağlantı güncellendi: ${title}`);
        }
    } catch (error) {
        console.error("[DB HATA] Bağlantı eklenemedi:", error.message);
        throw error; 
    }
}

/**
 * 'links' koleksiyonundan tüm bağlantıları alır.
 */
async function getAllLinks() {
    if (!db) {
        throw new Error("Veritabanı bağlı değil.");
    }
    const collection = db.collection('links');
    return await collection.find({}).sort({ createdAt: -1 }).toArray();
}

/**
 * *** YENİ FONKSİYON ***
 * 'links' koleksiyonundan ID'ye göre bir linki siler.
 */
async function deleteLink(linkId) {
    if (!db) {
        throw new Error("Veritabanı bağlı değil.");
    }
    const collection = db.collection('links');
    try {
        // MongoDB'nin _id'si bir ObjectId nesnesi olmalıdır
        const result = await collection.deleteOne({ _id: new ObjectId(linkId) });
        console.log(`[DB] Link silindi, silinen sayı: ${result.deletedCount}`);
        return result;
    } catch (error) {
        console.error("[DB HATA] Link silinemedi:", error.message);
        if (error.message.includes("Argument passed in must be a string of 12 bytes")) {
            console.error("Hata: Geçersiz Link ID formatı.");
            return { deletedCount: 0 }; // Geçersiz ID ise 0 döndür
        }
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
    deleteLink // <-- YENİ
};
