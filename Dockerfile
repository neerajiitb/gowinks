FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node public ./public
COPY --chown=node:node server ./server
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node drizzle ./drizzle
RUN mkdir -p /app/data && chown node:node /app/data
USER node
ENV PORT=3000
EXPOSE 3000
CMD ["node","server/node.mjs"]
