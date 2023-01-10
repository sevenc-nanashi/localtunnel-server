FROM node:16.17.0-alpine

WORKDIR /app

RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml /app/

RUN pnpm install --frozen-lockfile --prod

COPY . /app

RUN pnpm run build
ENV NODE_ENV production
ENTRYPOINT ["node", "dist/index.js"]
