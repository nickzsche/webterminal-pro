FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache openssh-client

COPY package*.json ./
RUN npm ci --only=production

COPY . .

RUN mkdir -p data logs && \
    chown -R node:node /app

USER node

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

CMD ["sh", "-c", "mkdir -p logs && node server.ts"]
