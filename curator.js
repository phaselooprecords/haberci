// curator.js (GÜNCELLENDİ: Daha güvenilir ve akıllı YZ istemleri)

require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const { google } = require('googleapis');
const sharp = require('sharp');
const fetch = require('node-fetch');

// --- API İSTEMCİLERİ KURULUMU ---
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const model = 'gemini-2.5-flash';
const customsearch = google.customsearch('v1');
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY; // Doğru API anahtarını kullan
const GOOGLE_SEARCH_CX = process.env.GOOGLE_SEARCH_CX;

// --- YARDIMCI FONKSİYON: XML/HTML karakterlerinden kaçınma ---
function escapeXml(unsafe) {
    if (typeof unsafe !== 'string') {
        console.warn('[escapeXml] Girdi bir string değildi:', unsafe);
        return '';
    }
    return unsafe.replace(/[<>&'"]/g, function (c) {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
            default: return c;
        }
    });
}

// --- YARDIMCI FONKSİYON: SVG için metin kaydırma ---
function wrapText(text, maxCharsPerLine, maxLines = 2) {
    if (!text) return [''];
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    words.forEach(word => {
        if (lines.length >= maxLines) return;
        const testLine = currentLine ? currentLine + ' ' + word : word;
        if (testLine.length > maxCharsPerLine && currentLine.length > 0) {
            lines.push(currentLine.trim());
            currentLine = word;
            if (lines.length >= maxLines) return;
        } else {
            currentLine = testLine;
        }
    });

    if (currentLine.trim().length > 0 && lines.length < maxLines) {
        lines.push(currentLine.trim());
    }
    return lines.slice(0, maxLines);
}


// --- API FONKSİYONU 1: YAPAY ZEKA METNİ OLUŞTURMA (*** TÜRKÇE İSTEM ***) ---
async function generateAiText(article) {
    const prompt = `
        Sen gazetecilik ilkelerine (açıklık, doğruluk, kısalık) bağlı kalarak genel haberlere odaklanan bir içerik küratörüsün.
        GÖREV: Haberi SADECE sağlanan başlığa göre analiz et. Aşağıdaki içeriği Türkçe olarak oluştur:
        1.  **image_headline**: Bir resim üzerine bindirmek için uygun, çok kısa (5-7 kelime) bir başlık. Bunu markdown kullanarak kalın yap (**başlık**).
        2.  **short_description**: Kısa bir açıklama (en fazla 40 kelime, başlıkta geçen anahtar konuları İÇERMELİ, resim bindirmesi için uygun).
        3.  **social_caption**: Instagram/Twitter gibi platformlar için hazır, toplam en fazla 100 kelimelik bir sosyal medya gönderi metni. Yapı tam olarak şöyle olmalı:
            * İlk satır: Dikkat çekici bir sosyal medya başlığı (image_headline'dan farklı, markdown kalıbı kullanma).
            * İkinci satır: Yeni bir paragraf başlat. Kaynak makale başlığından çıkarılan temel haberi benzersiz bir şekilde özetleyen bilgilendirici bir paragraf yaz. İlgi çekici, gazetecilik tonu kullan. Girdi başlığından veya sosyal medya başlığından ifadeleri tekrarlamaktan kaçın.
            * Paragrafı haber kaynağını belirterek bitir: (Kaynak: ${article.source}).
            * #Haber veya #Gündem gibi genel bir hashtag ekle.

        HABER BAŞLIĞI: "${article.title}"

        Oluşturulan metnin tekrardan kaçındığından ve bilgiyi net bir şekilde sunduğundan emin ol. social_caption MUTLAKA iki bölümlü yapıyı (başlık, ardından kaynak/hashtag içeren paragraf) takip etmelidir.
        YANITI KESİNLİKLE AŞAĞIDAKİ GİBİ İNGİLİZCE ANAHTARLARLA JSON OLARAK FORMATLA: { "image_headline": "...", "short_description": "...", "social_caption": "..." }`;

    console.log(`[generateAiText] Metin oluşturma başlıyor: ${article.title}`);
    try {
        console.log("[generateAiText] Gemini modeline istem gönderiliyor:", model);
        const generationResult = await ai.models.generateContent({
             model,
             contents: [{ role: 'user', parts: [{ text: prompt }] }],
             generationConfig: { responseMimeType: "application/json" }
         });
        console.log("[generateAiText] Gemini'den yanıt alındı.");

        let rawResponseText = null;
        try {
            if (generationResult?.candidates?.[0]?.content?.parts?.[0]?.text && typeof generationResult.candidates[0].content.parts[0].text === 'string') {
                 rawResponseText = generationResult.candidates[0].content.parts[0].text;
            } else {
                 console.error("[generateAiText HATA] Beklenmeyen Gemini yanıt yapısı (Candidates/Content/Parts):", JSON.stringify(generationResult, null, 2));
                 throw new Error("Beklenmeyen Gemini yanıt yapısı (Candidates/Content/Parts).");
            }
        } catch (accessError) {
             console.error("[generateAiText HATA] Yanıt metnine erişim hatası:", accessError);
             console.error("[generateAiText HATA] Erişim Hatasında Tam Gemini Yanıtı:", JSON.stringify(generationResult, null, 2));
             throw new Error("Gemini yanıt yapısı işlenirken hata.");
        }

        console.log("[generateAiText] Ham Gemini yanıt metni:", rawResponseText);
        if (!rawResponseText || rawResponseText.trim() === '') { console.error("[generateAiText HATA] Çıkarılan Gemini yanıt metni geçersiz veya boş."); throw new Error("Çıkarılan Gemini yanıt metni geçersiz veya boştu."); }

        console.log("[generateAiText] JSON ayrıştırması deneniyor...");
        const cleanedJsonString = rawResponseText.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '');
        const resultJson = JSON.parse(cleanedJsonString);
        
        const result = {
            headline: resultJson.image_headline,
            description: resultJson.short_description,
            caption: resultJson.social_caption,
            originalSource: article.source
        };
        console.log("[generateAiText] JSON başarıyla ayrıştırıldı:", result);

        if (!result.headline || !result.description || !result.caption) {
             console.warn("[generateAiText] Ayrıştırılan JSON'da beklenen alanlar eksik.");
             throw new Error("Ayrıştırılan JSON'da beklenen alanlar eksik (headline, description, caption).");
         }

        console.log(`[generateAiText] İçerik başarıyla oluşturuldu.`);
        return result;

    } catch (error) {
        console.error("[generateAiText CATCH BLOK HATASI]", error.message);
        return { headline: "YZ Başarısız Oldu", description: "Oluşturma Hatası. Sunucu loglarına bakın.", caption: "Hata.", originalSource: article.source };
    }
}

// --- API FONKSİYONU 2: ARAMA ANAHTAR KELİMELERİNİ ÇIKAR (*** TÜRKÇE İSTEM ***) ---
async function extractSearchKeywords(headline, description) {
    console.log(`[AI Keywords] Anahtar kelimeler çıkarılıyor: "${headline}" / "${description}"`);
    const inputText = `Başlık: ${headline}\nAçıklama: ${description}`;
    
    const prompt = `
        Aşağıdaki haber metnini analiz et:
        ---
        ${inputText}
        ---
        Metinden en önemli görsel konuyu (örn: "terk edilmiş bina", "yapay zeka sohbet robotu", "bayram şekeri") belirle.
        Bu konu için 2-3 kelimelik bir Google Görsel Arama sorgusu oluştur.
        SADECE arama sorgusunu ÇIKTI olarak ver.`;

    try {
        const generationResult = await ai.models.generateContent({ model, contents: [{ role: 'user', parts: [{ text: prompt }] }] });
        console.log("[AI Keywords] Gemini'den yanıt alındı.");
        let keywords = null;
        try {
            if (generationResult?.candidates?.[0]?.content?.parts?.[0]?.text && typeof generationResult.candidates[0].content.parts[0].text === 'string') {
                 keywords = generationResult.candidates[0].content.parts[0].text.trim().replace(/[\*\"]/g, '');
            } else {
                 console.error("[AI Keywords HATA] Beklenmeyen Gemini yanıt yapısı:", JSON.stringify(generationResult, null, 2));
                 throw new Error("Anahtar kelimeler için beklenmeyen Gemini yanıt yapısı.");
            }
        } catch (accessError) {
              console.error("[AI Keywords HATA] Yanıt metnine erişim hatası:", accessError);
              throw new Error("Gemini anahtar kelime yanıt yapısı işlenirken hata.");
         }
        console.log(`[AI Keywords] Çıkarılan Anahtar Kelimeler: "${keywords}"`);
        if (!keywords || keywords.toLowerCase().includes('cannot fulfill') || keywords.toLowerCase().includes('please provide')) {
            console.warn('[AI Keywords] Çıkarma başarısız veya geçersiz anahtar kelime döndü.');
            return null;
        }
        return keywords;
    } catch (error) {
        console.error("[AI Keywords CATCH BLOK HATASI]", error.message);
        return null;
    }
}

// --- API FONKSİYONU 3: ALTERNATİF ANAHTAR KELİMELER AL (*** TÜRKÇE İSTEM ***) ---
async function getAlternativeKeywords(headline, description, previousKeywords = []) {
    const inputText = `Başlık: ${headline}\nAçıklama: ${description}`;
    const previousKeywordsString = previousKeywords.map(kw => `"${kw}"`).join(', ');
    console.log(`[AI AltKeywords] Alternatif anahtar kelimeler isteniyor, şunlar hariç: ${previousKeywordsString}`);
    
    const prompt = `
        Aşağıdaki haber başlığını analiz et: "${headline}"
        Kullanıcı zaten şunları aradı: ${previousKeywordsString}
        Görsel olarak alakalı, bir YENİ, alternatif 2-3 kelimelik arama sorgusu sağla.
        Bu yeni sorgu MUTLAKA öncekilerden farklı olmalıdır.
        
        Örnek:
        Başlık: "Kamu güvenliği uyarısı, bireyleri terk edilmiş binalardan uzak durmaya çağırıyor"
        Önceki: "terk edilmiş binalar"
        Yeni Sorgu: "kentsel çürüme"
        
        SADECE yeni alternatif anahtar kelime öbeğini ÇIKTI olarak ver.`;

    try {
        const generationResult = await ai.models.generateContent({ model, contents: [{ role: 'user', parts: [{ text: prompt }] }] });
        console.log("[AI AltKeywords] Gemini'den yanıt alındı.");
        let newKeywords = null;
        try {
            if (generationResult?.candidates?.[0]?.content?.parts?.[0]?.text && typeof generationResult.candidates[0].content.parts[0].text === 'string') {
                   newKeywords = generationResult.candidates[0].content.parts[0].text.trim().replace(/[\*\"]/g, '');
              } else {
                  console.error("[AI AltKeywords HATA] Beklenmeyen Gemini yanıt yapısı:", JSON.stringify(generationResult, null, 2));
                  throw new Error("Alternatif anahtar kelimeler için beklenmeyen Gemini yanıt yapısı.");
              }
          } catch (accessError) {
               console.error("[AI AltKeywords HATA] Yanıt metnine erişim hatası:", accessError);
               throw new Error("Gemini alternatif anahtar kelime yanıt yapısı işlenirken hata.");
          }
        console.log(`[AI AltKeywords] Ham Çıkarılan Metin: "${newKeywords}"`);
        
        const lowerNewKeywords = newKeywords.toLowerCase();
        const lowerPreviousKeywords = previousKeywords.map(kw => kw.toLowerCase());

        if (!newKeywords || newKeywords.toLowerCase().includes('cannot fulfill') || lowerPreviousKeywords.includes(lowerNewKeywords)) {
            console.warn('[AI AltKeywords] Çıkarma başarısız, geçersiz veya tekrarlanan anahtar kelime döndü.');
            return null;
        }
        
        console.log(`[AI AltKeywords] Geçerli Alternatif Anahtar Kelimeler: "${newKeywords}"`);
        return newKeywords;
    } catch (error) {
        console.error("[AI AltKeywords CATCH BLOK HATASI]", error.message);
        return null;
    }
}


// --- API FONKSİYONU 4: RESİM ARAMA ---
async function searchForRelevantImages(query, startIndex = 0) {
    console.log(`[Image Search] Aranıyor: "${query}", başlangıç indeksi ${startIndex}`);
    try {
        if (!GOOGLE_SEARCH_CX || !GOOGLE_API_KEY) { throw new Error("Google Search CX veya API Key eksik."); }
        const apiStartIndex = startIndex + 1;
        
        const response = await customsearch.cse.list({ 
            auth: GOOGLE_API_KEY, 
            cx: GOOGLE_SEARCH_CX, 
            q: query, 
            searchType: 'image', 
            num: 9, 
            start: apiStartIndex, 
            safe: 'medium' // Filtre gevşetildi
        });

        if (!response.data.items || response.data.items.length === 0) { 
            if (startIndex === 0) { 
                console.log(`[Image Search] "${query}" için resim bulunamadı.`); 
                return []; 
            } else { 
                console.log(`[Image Search] Daha fazla resim bulunamadı.`); 
                return []; 
            } 
        }

        const imagesData = response.data.items.map(item => ({ 
            imageUrl: item.link, 
            contextUrl: item.image?.contextLink, 
            query: query, 
            width: item.image?.width, 
            height: item.image?.height 
        }));
        
        console.log(`[Image Search] ${imagesData.length} resim bulundu.`);
        return imagesData;
    } catch (error) { 
        console.error(`[Image Search HATA]`, error.message); 
        return []; 
    }
}

// --- API FONKSİYONU 5: İLGİLİ WEB MAKALELERİNİ BULMA ---
async function findRelatedWebArticles(title, source) {
    const query = `${title} ${source}`;
    console.log(`[Web Search] Aranıyor: ${query}`);
    try {
        if (!GOOGLE_SEARCH_CX || !GOOGLE_API_KEY) { throw new Error("Google Search CX veya API Key eksik."); }
        const response = await customsearch.cse.list({ auth: GOOGLE_API_KEY, cx: GOOGLE_SEARCH_CX, q: query, num: 5 });
        if (!response.data.items || response.data.items.length === 0) { throw new Error('İlgili makale bulunamadı.'); }
        const articles = response.data.items.map(item => ({ title: item.title, link: item.link, source: item.displayLink }));
        console.log(`[Web Search] ${articles.length} ilgili makale bulundu.`);
        return articles;
    } catch (error) { console.error(`[Web Search HATA]`, error.message); return []; }
}

// --- API FONKSİYONU 6: İLGİLİ VİDEO BULMA (Sadece Başlık) ---
async function findRelatedVideo(title, source) {
    const query = `${title} video`; // Sadece başlığı kullanarak ara
    console.log(`[Video Search] Aranıyor: ${query}`);
    try {
        if (!GOOGLE_SEARCH_CX || !GOOGLE_API_KEY) { throw new Error("Google Search CX veya API Key eksik."); }
        const response = await customsearch.cse.list({ auth: GOOGLE_API_KEY, cx: GOOGLE_SEARCH_CX, q: query, num: 1 });
        if (response.data.items && response.data.items.length > 0) { const firstResult = response.data.items[0]; if (firstResult.link && (firstResult.link.includes('youtube.com/watch') || firstResult.link.includes('youtu.be/') || firstResult.link.includes('vimeo.com/'))) { console.log(`[Video Search] Video bulundu: ${firstResult.link}`); return firstResult.link; } else { console.log(`[Video Search] İlk sonuç video linki değil: ${firstResult.link}`); } }
        else { console.log('[Video Search] Video sonucu bulunamadı.'); }
        return null;
    } catch (error) { console.error(`[Video Search HATA]`, error.message); return null; }
}


// --- YARDIMCI FONKSİYON: ÖNİZLEME RESMİ OLUŞTURMA (HABER STİLİ) ---
async function generateSimplePreviewImage(imageUrl, overlayTextString) {
    console.log(`[Simple Preview] Önizleme oluşturma başlıyor.`);
    console.log(`[Simple Preview] Resim URL: ${imageUrl}`);
    console.log(`[Simple Preview] Ham Bindirme Metni:`, overlayTextString ? overlayTextString : 'Yok');

    try {
        if (!imageUrl || typeof imageUrl !== 'string') { throw new Error('Geçersiz imageUrl'); }
        const cleanOverlayText = typeof overlayTextString === 'string' ? overlayTextString.replace(/^\*\*|\*\*$/g, '').trim() : '';

        console.log(`[Simple Preview] Resim çekiliyor: ${imageUrl}`);
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error(`Fetch başarısız: ${response.statusText}`);
        const imageBuffer = await response.buffer();
        console.log(`[Simple Preview] Resim çekildi.`);

        const metadata = await sharp(imageBuffer).metadata();
        const originalWidth = metadata.width;
        const originalHeight = metadata.height;
        if (!originalWidth || !originalHeight) throw new Error('Boyutlar okunamadı.');
        console.log(`[Simple Preview] Orijinal Boyutlar: ${originalWidth}x${originalHeight}`);

        const maxWidth = 800;
        let targetWidth = originalWidth;
        let targetHeight = originalHeight;
        if (originalWidth > maxWidth) {
            targetWidth = maxWidth;
            targetHeight = Math.round(originalHeight * (maxWidth / originalWidth));
        }

        let processedImageBuffer = imageBuffer;
        if (originalWidth > maxWidth) {
             processedImageBuffer = await sharp(imageBuffer).resize({ width: targetWidth, height: targetHeight, fit: 'inside' }).toBuffer();
        }
        console.log(`[Simple Preview] Son Resim Boyutları: ${targetWidth}x${targetHeight}`);

        // --- Metin Hazırlığı ---
        let overlayText = cleanOverlayText || " ";

        // --- Dinamik Font Boyutu & Kaydırma ---
        let dynamicFontSize = Math.round(targetWidth * 0.032); // Haber için biraz daha büyük %
        if (dynamicFontSize < 18) dynamicFontSize = 18; // Daha büyük min boyut
        if (dynamicFontSize > 40) dynamicFontSize = 40; // Daha büyük maks boyut
        
        const overlayFontSize = dynamicFontSize;
        const overlayCharsPerLine = Math.round(targetWidth / (overlayFontSize * 0.60)); 
        const overlayLines = wrapText(overlayText, overlayCharsPerLine, 2); // En fazla 2 satır
        const escapedOverlayText = overlayLines.map(line => escapeXml(line));
        console.log(`[Simple Preview] Bindirme için metin:`, escapedOverlayText);

        // --- Dinamik SVG Oluşturma (Haber Stili) ---
        const lineSpacing = 1.25; 
        const padding = Math.round(overlayFontSize * 0.65); 
        const textBlockHeight = overlayLines.length * overlayFontSize + (overlayLines.length > 1 ? (overlayLines.length - 1) * overlayFontSize * (lineSpacing - 1) : 0) ;
        const overlayHeight = Math.max(50, textBlockHeight + padding * 2); 

        let textTspans = '';
        escapedOverlayText.forEach((line, index) => {
            const dy = index === 0 ? 0 : `${lineSpacing}em`;
            textTspans += `<tspan x="${padding}" dy="${dy}">${line}</tspan>`;
        });

        const textStartY = padding + overlayFontSize * 0.9; 

        // --- SVG Stil Güncellemesi ---
        const svgOverlay = `<svg width="${targetWidth}" height="${overlayHeight}">
            <rect x="0" y="0" width="${targetWidth}" height="${overlayHeight}" fill="#000000" opacity="0.75"/>
            <text y="${textStartY}" style="font-family: 'Georgia', Times, serif; font-size: ${overlayFontSize}px; font-weight: bold;" fill="#FFFFFF">
                ${textTspans}
            </text>
        </svg>`;
        // --- SVG Stil Güncellemesi Sonu ---

        console.log(`[Simple Preview] SVG Bindirmesi oluşturuldu (${targetWidth}x${overlayHeight}).`);

        // --- Resmi Birleştirme ---
        console.log(`[Simple Preview] Bindirme birleştiriliyor...`);
        const compositeTop = Math.round(targetHeight - overlayHeight - 15); // Alttan biraz daha yukarı konumlandır
        console.log(`[Simple Preview] Hedef yükseklik: ${targetHeight}, Bindirme yüksekliği: ${overlayHeight}, Birleştirme üst: ${compositeTop}`);

        const finalImageBuffer = await sharp(processedImageBuffer)
            .composite([{ input: Buffer.from(svgOverlay), top: compositeTop < 0 ? 0 : compositeTop, left: 0 }])
            .png().toBuffer();
        console.log("[Simple Preview] Resim işleme tamamlandı.");

        // --- Buffer'ı Döndür ---
        console.log(`[Simple Preview] Başarılı: Resim buffer'ı döndürülüyor.`);
        return finalImageBuffer; // <-- BUFFER'I DÖNDÜR

    } catch (error) {
        console.error("--- generateSimplePreviewImage: CATCH BLOK GİRİLDİ ---");
        console.error("[generateSimplePreviewImage HATA RAW]", error);
        console.error(`[generateSimplePreviewImage HATA Mesajı]: ${error.message}`);
        console.log("--- generateSimplePreviewImage: Fonksiyon SONU (Hata) ---");
        return null; // <-- BAŞARISIZLIKTA NULL DÖNDÜR
    }
}
// --- GÜNCELLENMİŞ FONKSİYON SONU ---


// --- DIŞA AKTARMALAR ---
module.exports = {
    generateAiText,
    extractSearchKeywords,
    getAlternativeKeywords,
    searchForRelevantImages,
    findRelatedWebArticles,
    findRelatedVideo,
    generateSimplePreviewImage
};