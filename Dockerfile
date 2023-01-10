FROM node:16.17.0-alpine AS build

WORKDIR /app

RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml /app/

RUN pnpm install --frozen-lockfile

COPY . /app

RUN pnpm run build

# ----------------------------------------------------------------------------

FROM node:16.17.0-alpine AS runner

WORKDIR /app

RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml /app/

RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/dist ./dist

ENV NODE_ENV production
ENTRYPOINT ["node", "dist/index.js"]
