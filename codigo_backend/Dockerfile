FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

COPY app/package*.json ./
RUN npm install --omit=dev

COPY app/prisma ./prisma
RUN npx prisma generate

COPY app/dist ./dist
COPY app/docker-entrypoint.sh ./docker-entrypoint.sh
COPY app/chatwoot-dashboard-script.template.html ./chatwoot-dashboard-script.template.html

RUN chmod +x docker-entrypoint.sh

EXPOSE 3000

CMD ["sh", "docker-entrypoint.sh"]
