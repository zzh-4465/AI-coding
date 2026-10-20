FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV AI_PROXY_HOST=0.0.0.0
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --chown=node:node *.mjs ./
USER node
CMD ["node", "ai-proxy.mjs"]
