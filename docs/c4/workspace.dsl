workspace "TEFIIS" "Gestión de reclamos estudiantiles de la FIIS-UNI" {

    model {
        estudiante = person "Estudiante UNI-FIIS" "Presenta reclamos de matrícula y realiza consultas a Tefi."
        tercio = person "Miembro del tercio estudiantil" "Revisa los reclamos, decide los cursos y responde."
        admin = person "Administrador del sistema" "Gestiona cuentas, permisos y configuración del sistema."

        gemini = softwareSystem "Servicio LLM Externo - File Search Gemini API" "RAG del BOT." "Sistema externo"
        correo = softwareSystem "Proveedores de correo" "Brevo (primario), Resend y Mailjet (con respaldo automático)." "Sistema externo"
        firebase = softwareSystem "Firebase Authentication" "Autenticación del administrador." "Sistema externo"
        m2 = softwareSystem "Servicio M2" "Recibe el expediente de cada reclamo." "Sistema externo"

        tefiis = softwareSystem "Sistema TEFIIS" "Sistema de gestión de reclamos estudiantiles." {
            spa = container "Aplicación de estudiantes" "Reclamos, chat con Tefi, perfil y seguimiento." "React 19, TypeScript, Vite"
            panel = container "Panel del Tercio y Administración" "Bandeja, expediente, estados, cursos resueltos y respuestas." "React, Vite"
            api = container "API TEFIIS" "Reglas de reclamos, sesiones, Tefi, correos, eventos y auditoría." "Node.js 22, Express 5" {
                auth = component "Componente de Autenticación y Autorización" "Valida JWT de estudiantes y tokens de Firebase, verifica listas de administradores y protege rutas." "server.js (Middleware)"
                reclamos = component "Componente de Gestión de Reclamos y Cursos" "Casos de uso y dominio: registra reclamos, publica ReclamoRegistrado y resuelve cursos mediante puertos." "backend/presentacion, aplicacion y dominio (y rutas aún en server.js)"
                persistencia = component "Adaptadores de Persistencia" "Implementa RepositorioReclamos y RepositorioCursosResueltos con adaptadores intercambiables en Supabase y en memoria." "backend/infraestructura (PostgREST / Memoria)"
                eventos = component "Bus de Eventos y Consumidor M2" "Implementa PublicadorEventos (busEnProceso / publicadorMemoria) y consume ReclamoRegistrado hacia M2 vía ClienteM2." "backend/infraestructura y aplicacion/consumidores"
                notificaciones = component "Componente de Notificaciones" "Consume ReclamoRegistrado para confirmar reclamos y envía códigos y resoluciones con fallback Brevo -> Resend -> Mailjet." "backend/aplicacion/consumidores y server.js"
                tefi = component "Componente de Asistente Virtual Tefi" "Atiende consultas en lenguaje natural usando RAG sobre los reglamentos con Gemini." "promptTefi.js y server.js"
                auditoria = component "Componente de Auditoría y Trazabilidad" "Registra de forma inmutable las acciones administrativas y eventos del sistema en activity_log." "server.js (logActividad)"
                documentos = component "Componente de Gestión de Documentos" "Valida archivos PDF del SIGA y evidencias, gestionando URLs firmadas en Storage." "server.js"
            }
            bd = container "Base de datos" "reclamos, respuestas_reclamo, activity_log, conversaciones, app_settings, documentos_estudiante." "PostgreSQL en Supabase" "Almacén de datos"
            archivos = container "Archivos" "PDF del SIGA y evidencias." "Supabase Storage" "Almacén de datos"
        }

        # Contexto. Relaciones explícitas de nivel 1
        estudiante -> tefiis "Usa portal de reclamos" "HTTPS"
        tercio -> tefiis "Usa portal de miembro TEFIIS" "HTTPS"
        admin -> tefiis "Usa portal de administrador" "HTTPS"
        tefiis -> correo "Envía códigos, confirmaciones y respuestas" "JSON/HTTPS"
        tefiis -> gemini "Consume el modelo" "HTTPS"
        tefiis -> firebase "Valida usuario" "HTTPS"
        tefiis -> m2 "Registra el expediente de cada reclamo" "JSON/HTTPS"

        # Contenedores.
        estudiante -> spa "Usa portal de reclamos" "HTTPS"
        tercio -> panel "Usa portal de miembro TEFIIS" "HTTPS"
        admin -> panel "Usa portal de administrador" "HTTPS"
        spa -> api "Envía reclamos, documentos y consultas a Tefi" "JSON/HTTPS, JWT"
        panel -> firebase "Inicia sesión" "Firebase SDK"
        panel -> api "Lista reclamos, cambia estados, registra cursos resueltos y responde" "JSON/HTTPS, token de Firebase"
        api -> firebase "Verifica el token" "Admin SDK"
        api -> gemini "Envía preguntas con búsqueda en los reglamentos" "JSON/HTTPS"
        api -> correo "Envía códigos, confirmaciones y respuestas con fallback" "JSON/HTTPS"
        api -> m2 "Registra el expediente al publicar ReclamoRegistrado (objetivo #27)" "JSON/HTTPS"
        api -> bd "Lee y escribe reclamos, respuestas, auditoría y configuración" "PostgREST/HTTPS"
        api -> archivos "Guarda PDF y firma URL" "HTTPS"

        # Componentes de la API TEFIIS (Nivel 3).
        spa -> auth "Solicita código y envía peticiones con JWT de estudiante" "JSON/HTTPS, Bearer JWT"
        spa -> reclamos "Registra reclamos y consulta estado de expedientes" "JSON/HTTPS"
        spa -> tefi "Envía preguntas sobre reglamentos de matrícula" "JSON/HTTPS"
        spa -> documentos "Sube evidencias y PDFs del SIGA" "Multipart/HTTPS"
        panel -> auth "Envía peticiones administrativas con token de Firebase" "JSON/HTTPS, Bearer Token"
        panel -> reclamos "Lista reclamos, cambia estados, resuelve cursos y envía respuestas" "JSON/HTTPS"
        auth -> reclamos "Autoriza el acceso a rutas protegidas" "In-process"
        auth -> notificaciones "Solicita envío de código de verificación" "Llamada a función"
        reclamos -> persistencia "Lee y guarda reclamos y cursos resueltos mediante puertos" "In-process (RepositorioReclamos, RepositorioCursosResueltos)"
        reclamos -> eventos "Publica evento ReclamoRegistrado tras guardar el reclamo (objetivo #27)" "In-process (PublicadorEventos)"
        reclamos -> notificaciones "Solicita envío de correo al responder un reclamo" "Llamada a función"
        reclamos -> auditoria "Registra cada creación, decisión de cursos y cambio de estado" "Llamada a función"
        eventos -> notificaciones "Dispara confirmación por correo al consumir ReclamoRegistrado (objetivo #27)" "Evento en proceso"
        eventos -> persistencia "Consulta datos del reclamo para armar el expediente de M2 (objetivo #27)" "In-process (RepositorioReclamos)"
        eventos -> m2 "Envía expediente del reclamo al consumir ReclamoRegistrado (objetivo #27)" "JSON/HTTPS (ClienteM2)"
        persistencia -> bd "Lee y escribe reclamos, cursos_resueltos y respuestas" "PostgREST/HTTPS"
        auth -> firebase "Verifica validez del token y obtiene identidad" "Admin SDK"
        tefi -> gemini "Envía consultas con búsqueda semántica en reglamentos" "JSON/HTTPS"
        notificaciones -> correo "Envía correos con fallback Brevo -> Resend -> Mailjet" "JSON/HTTPS"
        auditoria -> bd "Inserta eventos en activity_log" "PostgREST/HTTPS"
        documentos -> archivos "Guarda archivos PDF y genera URLs firmadas" "HTTPS"
    }

    views {
        systemContext tefiis "Contexto" {
            title "Contexto del sistema TEFIIS"
            include *
            autolayout lr
        }
        container tefiis "Contenedores" {
            title "Contenedores de TEFIIS"
            include *
            autolayout tb
        }
        component api "Componentes" {
            title "Componentes de la API TEFIIS"
            include *
            autolayout tb
        }
        styles {
            element "Person" {
                shape person
                background #08427b
                color #ffffff
            }
            element "Software System" {
                background #1168bd
                color #ffffff
            }
            element "Container" {
                background #438dd5
                color #ffffff
            }
            element "Component" {
                background #85bbf0
                color #000000
            }
            element "Sistema externo" {
                background #999999
            }
            element "Almacén de datos" {
                shape cylinder
            }
            element "Boundary" {
                color #0b4884
            }
            relationship "Relationship" {
                style solid
            }
        }
    }
}
