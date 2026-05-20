# Stage 1: Build
FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# Receive Railway Variables as build args
ARG VITE_GATEWAY_URL
ARG VITE_HOME
ENV VITE_GATEWAY_URL=$VITE_GATEWAY_URL
ENV VITE_HOME=$VITE_HOME

RUN npm run build

# Stage 2: Serve static files
FROM node:18-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/dist ./dist

CMD ["sh", "-c", "serve -s dist -l tcp://0.0.0.0:${PORT:-4173}"]
