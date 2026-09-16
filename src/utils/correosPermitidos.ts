// Quién puede entrar a sistema-tefiis.
//
// La regla es el correo institucional. Las excepciones son estudiantes que no
// pueden acceder al suyo y necesitan presentar su reclamo igual: se añaden a
// mano, una a una y con el visto bueno del Tercio, porque cada una es una
// puerta abierta fuera de @uni.pe.
//
// Esta lista es solo para que la interfaz no le corte el paso antes de tiempo.
// Quien decide de verdad es el backend, que tiene la suya: si se añade un
// correo aquí y no allí, el servidor lo seguirá rechazando.
export const CORREOS_EXCEPCION = [
  'jeancruz.sbp@gmail.com',
];

export const correoPermitido = (email: string): boolean => {
  const limpio = (email || '').trim().toLowerCase();
  return limpio.endsWith('@uni.pe') || CORREOS_EXCEPCION.includes(limpio);
};
