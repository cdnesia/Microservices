FROM node:20-alpine

WORKDIR /app

# puppeteer butuh Chromium yang benar-benar jalan di Alpine — pakai Chromium sistem lewat
# apk (bukan yang di-download sendiri oleh puppeteer's postinstall, yang butuh glibc dan
# gagal di musl/Alpine) sebelum `npm install` supaya PUPPETEER_SKIP_CHROMIUM_DOWNLOAD sudah
# aktif saat install jalan. Sama seperti service-khs (juga generate PDF: KHS & KRS di sini).
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src

ENV PORT=5000
ENV NODE_ENV=production
EXPOSE 5000

HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:5000/health || exit 1

CMD ["node", "src/index.js"]
