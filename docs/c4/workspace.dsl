workspace "TEFIIS" "Gestión de reclamos estudiantiles de la FIIS-UNI" {

    model {
        estudiante = person "Estudiante UNI-FIIS" "Presenta reclamos de matrícula y realiza consultas a Tefi."
        tercio = person "Miembro del tercio estudiantil" "Revisa los reclamos, decide los cursos y responde."
        admin = person "Administrador del sistema" "Gestiona cuentas, permisos y configuración del sistema."

        gemini = softwareSystem "Servicio LLM Externo - File Search Gemini API" "RAG del BOT." "Sistema externo"
        correo = softwareSystem "Proveedores de correo" "Brevo (primario), Resend y Mailjet (con timeout y respaldo automático)." "Sistema externo"
        firebase = softwareSystem "Firebase Authentication" "Autenticación del administrador." "Sistema externo"
        m2 = softwareSystem "Servicio M2" "Recibe el expediente de cada reclamo." "Sistema externo"

        tefiis = softwareSystem "Sistema TEFIIS" "Sistema de gestión de reclamos estudiantiles." {
            spa = container "Aplicación de estudiantes" "Reclamos, chat con Tefi, perfil y seguimiento." "React 19, TypeScript, Vite"
            panel = container "Panel del Tercio y Administración" "Bandeja, expediente, estados, cursos resueltos y respuestas." "React, Vite"
            api = container "API TEFIIS" "API modular (7 workspaces conectados en server.js): reclamos, acceso, notificaciones, configuración, documentos, Tefi y núcleo compartido." "Node.js 22, Express 5" {
                acceso = component "Módulo Acceso" "Autentica estudiantes con código de 4 dígitos y JWT, valida tokens de Firebase y permisos de administradores." "@tefiis/acceso"
                reclamos = component "Módulo Reclamos" "Registra reclamos y publica ReclamoRegistrado, gestiona bandeja, estados, cursos resueltos y puertos de persistencia (Supabase/Memoria)." "@tefiis/reclamos"
                notificaciones = component "Módulo Notificaciones" "Consume ReclamoRegistrado para confirmar por correo y enviar el expediente a M2 vía ClienteM2 y FuenteDeExpedientes." "@tefiis/notificaciones"
                configuracion = component "Módulo Configuración" "Administra ventana de reclamos, modos operativos (PoliticaDeRecepcion), /health y consulta de auditoría." "@tefiis/configuracion"
                documentos = component "Módulo Documentos" "Valida archivos PDF del SIGA y evidencias, verifica pertenencia y gestiona URLs firmadas en Storage." "@tefiis/documentos"
                tefi = component "Módulo Tefi" "Atiende consultas en lenguaje natural sobre reglamentos mediante RAG con Gemini y guarda historial de chat." "@tefiis/tefi"
                compartido = component "Núcleo Compartido" "Infraestructura sin reglas de negocio: bus de eventos (busEnProceso), correo con timeout (Brevo/Resend/Mailjet), PostgREST, Storage y logActividad." "@tefiis/compartido"
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
        api -> correo "Envía códigos, confirmaciones y respuestas con timeout y fallback" "JSON/HTTPS"
        api -> m2 "Registra el expediente al publicar ReclamoRegistrado" "JSON/HTTPS"
        api -> bd "Lee y escribe reclamos, respuestas, auditoría y configuración" "PostgREST/HTTPS"
        api -> archivos "Guarda PDF y firma URL" "HTTPS"

        # Componentes de la API TEFIIS (Nivel 3 - 7 workspaces conectados en server.js).
        spa -> acceso "Solicita código de 4 dígitos y valida sesión JWT" "JSON/HTTPS, Bearer JWT"
        spa -> reclamos "Registra reclamos (avisos: api), sube evidencias y consulta seguimiento" "JSON/HTTPS"
        spa -> documentos "Sube PDFs del SIGA y solicita URLs firmadas" "Multipart/HTTPS"
        spa -> tefi "Envía preguntas sobre reglamentos de matrícula" "JSON/HTTPS"
        spa -> configuracion "Consulta ventana de reclamos y modos operativos" "JSON/HTTPS"
        panel -> acceso "Envía peticiones administrativas con token de Firebase" "JSON/HTTPS, Bearer Token"
        panel -> reclamos "Lista reclamos, cambia estados, resuelve cursos y responde" "JSON/HTTPS"
        panel -> configuracion "Administra ventana, modos y consulta auditoría" "JSON/HTTPS"
        panel -> documentos "Lista estudiantes y solicita URLs firmadas de documentos" "JSON/HTTPS"
        panel -> tefi "Audita conversaciones y sube documentos al índice RAG" "JSON/HTTPS"

        # Colaboración interna vía puertos inyectados en server.js y @tefiis/compartido.
        reclamos -> acceso "Verifica sesión de estudiante o administrador con middleware inyectado" "In-process"
        configuracion -> acceso "Verifica sesión de administrador con middleware inyectado" "In-process"
        documentos -> acceso "Verifica sesión de estudiante o administrador con middleware inyectado" "In-process"
        tefi -> acceso "Verifica sesión de estudiante o administrador con middleware inyectado" "In-process"
        reclamos -> configuracion "Consulta si se reciben reclamos mediante puerto inyectado" "In-process (PoliticaDeRecepcion)"
        reclamos -> documentos "Guarda y borra evidencias y verifica pertenencia mediante puertos" "In-process"
        reclamos -> notificaciones "Compone confirmación para la ruta de transición /api/reclamos/confirmar" "In-process"
        documentos -> configuracion "Consulta estado de despedida mediante puerto inyectado" "In-process"
        tefi -> configuracion "Consulta modos operativos y store de RAG mediante puerto inyectado" "In-process"
        notificaciones -> reclamos "Lee la descripción del reclamo para M2 mediante puerto inyectado" "In-process (FuenteDeExpedientes)"
        acceso -> compartido "Envía códigos por correo y registra actividad" "In-process (@tefiis/compartido)"
        reclamos -> compartido "Publica ReclamoRegistrado y usa PostgREST, correo y auditoría" "In-process (PublicadorEventos)"
        notificaciones -> compartido "Recibe ReclamoRegistrado del bus (suscripción en server.js) y envía confirmación con timeout" "Evento en proceso (busEnProceso)"
        documentos -> compartido "Usa Storage y cliente PostgREST" "In-process (@tefiis/compartido)"
        tefi -> compartido "Guarda conversaciones y consulta PostgREST" "In-process (@tefiis/compartido)"
        configuracion -> compartido "Lee y escribe app_settings y activity_log" "In-process (@tefiis/compartido)"

        # Salidas hacia sistemas externos y almacenes de datos.
        acceso -> firebase "Verifica validez del token y obtiene identidad" "Admin SDK"
        tefi -> gemini "Envía consultas con búsqueda semántica en reglamentos" "JSON/HTTPS"
        notificaciones -> m2 "Envía expediente del reclamo al consumir ReclamoRegistrado" "JSON/HTTPS (ClienteM2)"
        compartido -> correo "Envía correos con timeout y fallback Brevo -> Resend -> Mailjet" "JSON/HTTPS"
        compartido -> bd "Lee y escribe reclamos, respuestas, configuración y auditoría" "PostgREST/HTTPS"
        compartido -> archivos "Guarda y elimina archivos en Storage" "HTTPS"
        documentos -> archivos "Guarda PDFs del SIGA y genera URLs firmadas" "HTTPS"
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
