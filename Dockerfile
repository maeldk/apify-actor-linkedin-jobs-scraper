FROM apify/actor-node:22

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --include=dev && npm cache clean --force

COPY . ./
RUN npm run build
RUN npm prune --omit=dev

CMD ["node", "dist/main.js"]
