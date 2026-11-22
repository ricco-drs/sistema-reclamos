// Reglas de arquitectura del backend.
//
// El backend está partido en módulos de negocio (Lab09, docs/particiones.md). Cada módulo
// es un workspace de npm en backend/modulos/<módulo>/, con sus propias capas adentro, y
// backend/compartido/ guarda las piezas técnicas sin reglas de negocio. server.js es el
// único lugar que los conecta.
//
// - Capas (semana 6, #22): dentro de cada módulo, el dominio y la aplicación no dependen
//   de infraestructura, de presentación ni de compartido, y el dominio no importa paquetes
//   de npm.
// - Límites (semana 9, #50): un módulo no importa a otro; compartido no importa módulos;
//   ningún módulo importa server.js; desde fuera, a un módulo o a compartido solo se entra
//   por su index.js; y cada módulo declara en su package.json los paquetes que importa.
module.exports = {
  forbidden: [
    // ── Capas, dentro de cada módulo ──
    {
      name: 'dominio-limpio',
      comment: 'El dominio de un módulo no puede importar su infraestructura, su presentación ni compartido.',
      severity: 'error',
      from: { path: '^backend/modulos/([^/]+)/dominio/' },
      to: { path: '^backend/(modulos/$1/(infraestructura|presentacion)|compartido)/' },
    },
    {
      name: 'aplicacion-sin-infraestructura',
      comment: 'La aplicación usa los puertos del dominio; no puede importar infraestructura, presentación ni compartido.',
      severity: 'error',
      from: { path: '^backend/modulos/([^/]+)/aplicacion/' },
      to: { path: '^backend/(modulos/$1/(infraestructura|presentacion)|compartido)/' },
    },
    {
      name: 'dominio-sin-paquetes',
      comment: 'El dominio no puede importar paquetes de npm (express, firebase-admin, @supabase/supabase-js, etc.).',
      severity: 'error',
      from: { path: '^backend/modulos/[^/]+/dominio/' },
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

    // ── Límites entre módulos ──
    {
      name: 'modulo-no-importa-otro-modulo',
      comment: 'Un módulo no importa a otro. Lo que necesita de otro se lo pasa server.js por un puerto.',
      severity: 'error',
      from: { path: '^backend/modulos/([^/]+)/' },
      to: { path: '^backend/modulos/', pathNot: '^backend/modulos/$1/' },
    },
    {
      name: 'compartido-no-importa-modulos',
      comment: 'compartido es técnico y lo usan todos: no puede depender de ningún módulo ni del arranque.',
      severity: 'error',
      from: { path: '^backend/compartido/' },
      to: { path: '^backend/(modulos/|server\\.js$)' },
    },
    {
      name: 'modulo-no-importa-el-arranque',
      comment: 'server.js conecta los módulos; ningún módulo depende de él.',
      severity: 'error',
      from: { path: '^backend/modulos/' },
      to: { path: '^backend/server\\.js$' },
    },
    {
      name: 'entrada-publica-de-los-modulos',
      comment: 'Desde fuera de un módulo solo se entra por su index.js, que es lo que exporta su paquete.',
      severity: 'error',
      from: { pathNot: '^backend/modulos/' },
      to: { path: '^backend/modulos/[^/]+/', pathNot: '^backend/modulos/[^/]+/index\\.js$' },
    },
    {
      name: 'entrada-publica-de-compartido',
      comment: 'Desde fuera de compartido solo se entra por su index.js, que es lo que exporta su paquete.',
      severity: 'error',
      from: { pathNot: '^backend/compartido/' },
      to: { path: '^backend/compartido/', pathNot: '^backend/compartido/index\\.js$' },
    },
    {
      name: 'paquetes-declarados',
      comment: 'Cada módulo declara en su propio package.json los paquetes de npm que importa.',
      severity: 'error',
      from: { path: '^backend/(modulos/[^/]+|compartido)/' },
      to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown'] },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
  },
};
