# Resmi bir Node.js 20 çalışma zamanını temel imaj olarak kullan
FROM node:20-slim

# Konteyner içindeki çalışma dizinini ayarla
WORKDIR /app

# sharp için gerekli sistem paketlerini ve fontconfig'i yükle
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    pkg-config \
    libvips \
    fontconfig \
    libfreetype6-dev \
    && rm -rf /var/lib/apt/lists/*

# Önce package.json ve package-lock.json dosyalarını kopyala
# Bu, Docker önbelleğinden yararlanmayı sağlar
COPY package*.json ./

# Belirlenimci (deterministic) yüklemeler için npm ci kullanarak uygulama bağımlılıklarını yükle
# Bu, package-lock.json dosyasının var olmasını gerektirir
RUN npm ci --omit=dev

# Uygulama kodunun geri kalanını konteynere kopyala
COPY . .

# 3000 portunu erişilebilir yap (Railway env.PORT kullanacak)
EXPOSE 3000

# Uygulamayı start betiği ile çalıştırmak için komutu tanımla
CMD ["npm", "start"]