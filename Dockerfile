FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY sistema-reclamos/package*.json ./
RUN npm ci
COPY sistema-reclamos/ ./
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/backend ./backend
COPY --from=build --chown=node:node /app/src/data/cursos_secciones.json ./src/data/cursos_secciones.json
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node docker/iniciar.mjs ./iniciar.mjs
RUN mkdir scripts uploads && chown node:node scripts uploads

USER node
EXPOSE 3005 4173
CMD ["node", "iniciar.mjs"]
