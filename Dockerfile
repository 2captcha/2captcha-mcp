# Two stages, because the bridge is bundled: the toolchain that builds the
# single file has no reason to exist in the image that runs it.
FROM node:22-alpine AS build

WORKDIR /app

# ci, not install: install rewrites package-lock.json in place, and an image
# that quietly resolves different versions than CI tested is not the artifact
# anyone reviewed.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY server.js tool_groups.js prompts.js ./
COPY scripts/build.mjs ./scripts/build.mjs
RUN node scripts/build.mjs

FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# The bundle carries its dependencies, so there is nothing to install here.
# package.json comes along because the server reads its own version from it.
COPY --from=build /app/2captcha-mcp.mjs ./
COPY package.json ./

# node:*-alpine ships a non-root `node` user. Running as root bought nothing
# here — the process opens no ports and writes only to its cache dir.
ENV CACHE_DIR=/tmp/2captcha-mcp
USER node

ENTRYPOINT ["node", "2captcha-mcp.mjs"]
