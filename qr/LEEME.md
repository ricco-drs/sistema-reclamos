# QR de sistema-tefiis

Apunta a: **https://sistema-tefiis.reclamos.workers.dev**

- `tefiis-qr.svg` — para imprimir (carteles, volantes). Es vectorial, así que
  escala a cualquier tamaño sin pixelarse.
- `tefiis-qr.png` — 1200x1200, para pantalla, WhatsApp o diapositivas.

La URL va escrita dentro del propio código: no depende de ningún servicio
externo y no caduca. Nadie puede desactivarlo ni cobrar por él.

## Si cambia la URL

El QR deja de servir y hay que rehacerlo (y reimprimir lo que esté impreso).
Para regenerarlo, sin instalar nada:

    npx qrcode -t svg -e M -o qr/tefiis-qr.svg "https://LA-NUEVA-URL"
    npx qrcode -e M -w 1200 -o qr/tefiis-qr.png "https://LA-NUEVA-URL"

## Comprobado

Se decodifica correctamente y devuelve la URL exacta. Sigue leyéndose incluso
reducido a 80 px de lado, así que en papel cualquier tamaño a partir de 2 cm
funciona de sobra.
