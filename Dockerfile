FROM node:24-slim

WORKDIR /app
ENV CI=true
RUN corepack enable && corepack prepare pnpm@11.19.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.json tsconfig.base.json ./
COPY artifacts ./artifacts
COPY lib ./lib
COPY scripts ./scripts

RUN pnpm install --frozen-lockfile
RUN pnpm build

ENV NODE_ENV=production
ENV PORT=4173
EXPOSE 4173
CMD ["pnpm", "start"]
