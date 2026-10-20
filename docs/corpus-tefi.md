# Inventario del corpus de Tefi

Los documentos de consulta de Tefi se almacenan en Gemini File Search. La API utiliza el store configurado en `app_settings`, con la clave `rag_store_name`.

## Documentos

Inventario de la carpeta `documentos_entrenamiento/`, retirada del repositorio. El script de carga procesa únicamente PDF; la imagen JPEG se incluye como parte del inventario local.

| Archivo | Tamaño (bytes) |
| --- | ---: |
| R.D. RESUMEN 2026.xlsx - RES.DEC..pdf | 74494 |
| REGLAMENTO TRASLADO INTERNO (1).PDF | 136987 |
| RR 0116 2017.pdf | 4009625 |
| RR 0570-2022.pdf | 2762916 |
| RR 0884-2024  AYUDANTIA DE CATEDRA.pdf | 24392033 |
| RR 1075 2018.pdf | 827849 |
| RR 1715-2023.pdf | 1087129 |
| RR 2461-2023.pdf | 969853 |
| RR 477 2017.pdf | 4028337 |
| RR 544 2017.pdf | 1959224 |
| Reglamento de Estudios Generales - RR 0544 2017.pdf | 1827347 |
| convalidaciones-excepcionales-industrial-2026-II.pdf | 5576 |
| convalidaciones-excepcionales-sistemas-2026-II.pdf | 6123 |
| convalidaciones-excepcionales-sistemas.jpeg | 118785 |
| convalidaciones-industrial.pdf | 1484973 |
| convalidaciones-sistemas.pdf | 1522481 |
| cruces-de-horario-matricula.pdf | 2413 |
| estatuto-uni-2026.pdf | 1074166 |
| ley_universitaria_04_02_2022.pdf | 1147278 |
| pago-matricula-rezagados.pdf | 2402 |
| reglamento-de-matricula-29-03-2022.pdf | 2501185 |
Total: 21 archivos (20 PDF y una imagen), 47,63 MiB.

Los documentos se mantienen fuera del repositorio. Su consulta desde Tefi depende del acceso al store de Gemini File Search; no es necesario descargarlos al instalar o iniciar la API.

Decisión relacionada: [ADR-0004](adr/0004-corpus-fuera-del-repositorio.md).
