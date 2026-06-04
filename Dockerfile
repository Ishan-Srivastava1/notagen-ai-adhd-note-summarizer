FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json tsconfig.json ./
COPY prisma ./prisma
RUN npm install
RUN npx prisma generate

COPY src ./src
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app

RUN addgroup -S notagen && adduser -S notagen -G notagen

COPY --from=builder /app/dist         ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma       ./prisma

USER notagen
EXPOSE 8080

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
