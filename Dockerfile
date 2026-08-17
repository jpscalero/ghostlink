FROM node:20-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --prod --frozen-lockfile
COPY src/relay/ ./src/relay/
COPY src/relay.js ./src/relay.js
EXPOSE 8080
CMD ["node", "src/relay.js"]
