# Meter backend (Momay_meter.js) — Node/Express
# Template สำหรับ deploy "1 มิเตอร์ = 1 instance" บน Railway
FROM node:18-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Railway กำหนด PORT ให้เอง; server อ่าน process.env.PORT
EXPOSE 3000
CMD ["node", "Momay_meter.js"]
