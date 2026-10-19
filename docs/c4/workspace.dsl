workspace "TEFIIS" "Gestión de reclamos estudiantiles de la FIIS-UNI" {

    model {
        estudiante = person "Estudiante" "Presenta reclamos de matrícula y consulta a Tefi."
        tercio = person "Miembro del Tercio" "Revisa los reclamos, decide los cursos y responde."

        gemini = softwareSystem "Google Gemini" "Modelo de lenguaje con File Search." "Sistema externo"
        correo = softwareSystem "Proveedores de correo" "Brevo, Resend y Mailjet." "Sistema externo"
        firebase = softwareSystem "Firebase Authentication" "Cuentas del panel del Tercio." "Sistema externo"
        m2 = softwareSystem "Servicio M2" "Recibe el expediente de cada reclamo." "Sistema externo"

        tefiis = softwareSystem "TEFIIS" "Registra y resuelve los reclamos de matrícula." {
            spa = container "Aplicación de estudiantes" "Reclamos, chat con Tefi, perfil y seguimiento." "React 19, TypeScript, Vite"
            panel = container "Panel del Tercio" "Bandeja, expediente, estados, cursos resueltos y respuestas." "React, repositorio sistema-admin"
            api = container "API TEFIIS" "Reglas de reclamos, sesiones, Tefi, correos y auditoría." "Node.js 22, Express 5" {
                auth = component "requireAdminAuth" "Verifica el token de Firebase y la lista de administradores." "Middleware Express"
                handler = component "guardarCursosHandler" "Pasa de HTTP al caso de uso y traduce los errores." "backend/presentacion"
                log = component "logActividad" "Escribe la auditoría en activity_log." "server.js"
                casoDeUso = component "crearGuardarCursosResueltos" "Valida, lee, prepara y guarda." "backend/aplicacion"
                reglas = component "cursosResueltos" "Listas de hasta 40 cursos; historial de 50 con autor y fecha." "backend/dominio"
                puerto = component "RepositorioCursosResueltos" "obtener(id) y guardar(id, valor)." "backend/dominio"
                supabase = component "repositorioCursosSupabase" "PostgREST sobre reclamos.cursos_resueltos." "backend/infraestructura"
                memoria = component "repositorioCursosMemoria" "Map en memoria para pruebas y demostración." "backend/infraestructura"
            }
            bd = container "Base de datos" "reclamos, respuestas_reclamo, activity_log, conversaciones, app_settings, documentos_estudiante." "PostgreSQL en Supabase" "Almacén de datos"
            archivos = container "Archivos" "PDF del SIGA y evidencias." "Supabase Storage" "Almacén de datos"
        }

        # Contexto. Se declara antes que las relaciones de contenedores para que
        # Structurizr no deduzca la etiqueta a partir de una de ellas.
        tefiis -> firebase "Autentica a los miembros del Tercio" "Firebase SDK y Admin SDK"
        entregaCorreo = correo -> estudiante "Entrega códigos, confirmaciones y respuestas" "Correo electrónico"

        # Contenedores. Van antes que las de componentes por la misma razón:
        # sin ellas, el diagrama de contenedores mostraría «SELECT y PATCH» como
        # todo lo que la API hace con la base, y solo una ruta del panel.
        estudiante -> spa "Presenta reclamos, consulta a Tefi y sigue sus casos" "HTTPS"
        tercio -> panel "Revisa reclamos, decide cursos y responde" "HTTPS"
        spa -> api "Reclamos, documentos y preguntas a Tefi" "JSON/HTTPS, JWT"
        spa -> m2 "Registra el expediente" "JSON/HTTPS"
        panel -> firebase "Inicia sesión" "Firebase SDK"
        panel -> api "Lista reclamos, cambia estados, registra cursos resueltos y responde" "JSON/HTTPS, token de Firebase"
        api -> firebase "Verifica el token" "Admin SDK"
        api -> gemini "Envía preguntas con búsqueda en los reglamentos" "JSON/HTTPS"
        api -> correo "Envía códigos, confirmaciones y respuestas" "JSON/HTTPS"
        api -> bd "Lee y escribe reclamos, respuestas, auditoría y configuración" "PostgREST/HTTPS"
        api -> archivos "Guarda PDF y firma URL" "HTTPS"

        # Componentes de la rodaja «registrar cursos resueltos».
        panel -> auth "PUT /api/admin/reclamos/:id/cursos-resueltos" "JSON/HTTPS, token de Firebase"
        auth -> handler "Pasa la petición con adminEmail"
        handler -> casoDeUso "Invoca con id, admin y listas"
        handler -> log "Registra la decisión"
        casoDeUso -> reglas "Valida y arma el historial"
        casoDeUso -> puerto "obtener / guardar"
        supabase -> puerto "Implementa"
        memoria -> puerto "Implementa"
        supabase -> bd "SELECT y PATCH" "PostgREST/HTTPS"
        log -> bd "INSERT en activity_log" "PostgREST/HTTPS"
    }

    views {
        systemContext tefiis "Contexto" {
            title "Contexto del sistema TEFIIS"
            include *
            autolayout tb
        }
        container tefiis "Contenedores" {
            title "Contenedores de TEFIIS"
            include *
            # Ya se ve en el contexto; aquí empujaría al estudiante al fondo.
            exclude entregaCorreo
            autolayout tb
        }
        component api "Componentes" {
            title "Componentes de la API TEFIIS: registrar cursos resueltos"
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
