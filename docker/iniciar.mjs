import express from 'express';
import { fileURLToPath } from 'node:url';
import './backend/server.js';

const portal = express();
const directorio = fileURLToPath(new URL('./dist/', import.meta.url));
const inicio = fileURLToPath(new URL('./dist/index.html', import.meta.url));

portal.use((req, res, next) => {
  res.set('Content-Security-Policy', "connect-src 'self' http://localhost:3005");
  next();
});
portal.use(express.static(directorio));
portal.get('/{*ruta}', (req, res) => res.sendFile(inicio));
portal.listen(4173);
