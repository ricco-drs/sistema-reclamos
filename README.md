# Sistema de Gestión de Reclamos Estudiantiles

**TEFIIS** es una plataforma web integral diseñada para la **Facultad de Ingeniería Industrial y de Sistemas (FIIS)** de la **Universidad Nacional de Ingeniería (UNI)** en Perú. Su objetivo principal es optimizar, automatizar y hacer más transparente el proceso de registro, evaluación y resolución de reclamos y trámites presentados por los estudiantes.

El sistema se apoya en **Tefi**, un asistente conversacional inteligente potenciado por Inteligencia Artificial (RAG) que guía a los estudiantes y asiste en el análisis regulatorio de cada caso.
a
---

## 🚀 Características Principales

### 1. Asistente Inteligente (Tefi)
* **Chat Institucional con RAG**: Tefi resuelve dudas sobre matrícula, reglamentos, planes de estudio y trámites académicos basándose en documentos oficiales indexados de la FIIS-UNI.
* **Integración con Gemini**: Utiliza el SDK oficial de Google GenAI (`@google/genai`) y la tecnología de *File Search Stores* para realizar búsquedas contextuales precisas dentro de PDFs de entrenamiento.
* **Formateo Avanzado**: Renderiza respuestas con Markdown, tablas y fórmulas matemáticas en LaTeX (mediante KaTeX).

### 2. Gestión de Reclamos Académicos
* **Autoservicio del Estudiante**: Registro de reclamos clasificados por categorías y seguimiento del estado del trámite mediante un ID de caso único.
* **Extracción de Datos de PDFs**: Parseo automático de documentos oficiales descargados del SIGA (Ficha Académica, Boleta de Matrícula y Avance Curricular) mediante `pdfjs-dist`, cruzando datos del estudiante con la malla curricular.
* **Buzón del Evaluador**: Interfaz para el personal administrativo y académico (Miembros TEFIIS) con asignación automática, visualización completa del expediente y registro del dictamen (Aprobado/Rechazado).
* **Alertas de Larga Espera**: Identificación visual en el panel administrativo de casos acumulados que superen el tiempo de atención previsto.

### 3. Autenticación y Notificaciones
* **Acceso sin Contraseña (Passwordless)**: Verificación de identidad estudiantil mediante el envío de un código temporal de 4 dígitos exclusivo para correos institucionales de la UNI (`@uni.pe`).
* **Notificaciones por Correo**: Envío automático de confirmaciones de recepción y de resoluciones finales de reclamos por correo electrónico mediante la API de Brevo (Sendinblue).

---

## 🛠️ Stack Tecnológico

* **Frontend**: React 19, TypeScript, Vite, TailwindCSS 4.
* **Backend**: Node.js, Express.js.
* **Base de Datos / Auth**: Supabase (PostgreSQL, Cliente SDK con Service Key).
* **Servicio de IA**: Gemini (Google AI Studio) & File Search Stores.
* **Correos electrónicos**: Brevo HTTP API.
* **Lector de PDFs**: PDF.js (`pdfjs-dist`).

---

## 📁 Estructura del Proyecto

```text
├── backend/                       # Servidor Express, API REST y parsing de documentos
│   ├── server.js                  # Lógica del servidor, autenticación y llamadas a Gemini/Supabase
│   └── pdfParser.js               # Algoritmo de parseo de Ficha Académica, Boleta y Avance
├── docs/                          # Documentación del proyecto (Modelos C4, Requisitos, etc.)
│   ├── arquitectura_c4_M3.md
│   ├── atributos_calidad_M3.md
│   ├── requisitos_funcionales_M3.md
│   └── tefi.md                    # Análisis actual del módulo inteligente
├── documentos_entrenamiento/      # PDFs oficiales de la FIIS-UNI usados para alimentar el RAG de Tefi
├── src/                           # Frontend React + TypeScript
│   ├── assets/                    # Recursos visuales (logotipos, iconos)
│   ├── components/                # Componentes globales reutilizables
│   ├── features/                  # Módulos del negocio (chat, admin/reclamos, profile)
│   ├── hooks/                     # Custom hooks (autenticación, estado)
│   └── supabaseClient.ts          # Inicialización del cliente Supabase
├── scripts/                       # Scripts utilitarios (indexación RAG, formateo de carga horaria, etc.)
│   └── seed_rag.js                # Sube e indexa los PDFs de documentos_entrenamiento en Gemini
└── package.json                   # Dependencias y scripts de ejecución
```

---

## ⚙️ Configuración del Entorno

Para ejecutar el proyecto, debes crear un archivo `.env` en la raíz con las siguientes variables:

```env
# Puerto del Backend
PORT=3005

# Credenciales de Gemini (Google AI Studio)
VITE_API_KEY=tu_api_key_de_gemini

# Credenciales de Supabase
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_KEY=tu_service_role_key_para_el_backend
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu_anon_key_para_el_frontend

# Credenciales de Brevo (Envío de Correos)
BREVO_API_KEY=tu_api_key_de_brevo
FROM_EMAIL=no-responder@tu-dominio.com
```

---

## 🚀 Instalación y Uso en Local

### 1. Clonar el repositorio e instalar dependencias
```bash
git clone <url-del-repositorio>
cd sistema-tefiis
npm install
```

### 2. Indexar la base de conocimiento (RAG)
Ejecuta el script de RAG para subir los reglamentos oficiales de la carpeta `documentos_entrenamiento` a la tienda de búsqueda de archivos de Gemini:
```bash
node scripts/seed_rag.js
```
*Este proceso creará el archivo `backend/.rag_store_id` con el ID del store generado.*

### 3. Iniciar el servidor backend
```bash
npm run server
```
El servidor backend se levantará por defecto en el puerto `3005`.

### 4. Iniciar el servidor frontend de desarrollo
En otra terminal, ejecuta:
```bash
npm run dev
```
La aplicación web estará disponible en [http://localhost:5173](http://localhost:5173).
