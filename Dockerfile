FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --ignore-scripts

COPY server.js tool_groups.js ./

ENV NODE_ENV=production

ENTRYPOINT ["node", "server.js"]
