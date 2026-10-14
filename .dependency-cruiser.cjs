// Regla de arquitectura: el dominio no depende de infraestructura ni de presentación.
module.exports = {
  forbidden: [
    {
      name: 'dominio-limpio',
      comment: 'El dominio no puede importar infraestructura ni presentación.',
      severity: 'error',
      from: { path: '^backend/dominio' },
      to: { path: '^backend/(infraestructura|presentacion)' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
  },
};
