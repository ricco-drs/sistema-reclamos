# Emulador oficial de Firebase Authentication, solo para medir E2 en Compose.
# El panel del Tercio entra con Firebase; con este emulador la API verifica
# sesiones de prueba sin cuentas reales ni secretos.
FROM docker.io/library/node:22-bookworm-slim

ENV NO_UPDATE_NOTIFIER=1
RUN npm install --global firebase-tools@15.35.0 && npm cache clean --force

WORKDIR /emulador
COPY --chown=node:node firebase.json ./
RUN chown node:node /emulador
USER node
EXPOSE 9099
CMD ["firebase", "emulators:start", "--only", "auth", "--project", "demo-tefiis"]
