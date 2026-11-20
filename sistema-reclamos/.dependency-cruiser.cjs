// Reglas de arquitectura: el dominio y la aplicación no dependen de infraestructura,
// presentación ni paquetes externos.
module.exports = {
  forbidden: [
    {
      name: 'dominio-limpio',
      comment: 'El dominio no puede importar infraestructura ni presentación.',
      severity: 'error',
      from: { path: '^backend/dominio' },
      to: { path: '^backend/(infraestructura|presentacion)' },
    },
    {
      name: 'aplicacion-sin-infraestructura',
      comment: 'La aplicación usa los puertos del dominio; no puede importar infraestructura ni presentación.',
      severity: 'error',
      from: { path: '^backend/aplicacion' },
      to: { path: '^backend/(infraestructura|presentacion)' },
    },
    {
      name: 'dominio-sin-paquetes',
      comment: 'El dominio no puede importar paquetes de npm (express, firebase-admin, @supabase/supabase-js, etc.).',
      severity: 'error',
      from: { path: '^backend/dominio' },
      to: {
        dependencyTypes: [
          'npm',
          'npm-dev',
          'npm-optional',
          'npm-peer',
          'npm-bundled',
          'npm-no-pkg',
          'npm-unknown',
        ],
      },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
  },
};
