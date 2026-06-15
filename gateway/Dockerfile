# Gateway (IoT device registry + IR/MQTT) — Node/Express
FROM node:18-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Railway sets PORT; server reads GATEWAY_PORT (fallback below maps PORT→GATEWAY_PORT)
ENV GATEWAY_PORT=8002
EXPOSE 8002

CMD ["node", "server.js"]
