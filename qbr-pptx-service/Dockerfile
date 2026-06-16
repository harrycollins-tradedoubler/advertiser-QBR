FROM node:22-slim AS dependencies

ENV NODE_ENV=production

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-slim AS runtime

ENV NODE_ENV=production \
    PORT=8080

WORKDIR /app

COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY server.js ./server.js
COPY lib ./lib
COPY assets ./assets

RUN mkdir -p outputs && chown -R node:node /app

USER node

EXPOSE 8080

CMD ["node", "server.js"]
