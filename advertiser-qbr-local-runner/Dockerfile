FROM node:22-slim

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3021

WORKDIR /app

COPY package.json ./
COPY server.js ./server.js
COPY lib ./lib

EXPOSE 3021

CMD ["node", "server.js"]
