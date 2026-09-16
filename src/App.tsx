import React, { useState, useEffect } from 'react';
import ChatArea from './features/chat/components/ChatArea';
import ReclamosPanel from './features/admin/components/ReclamosPanel';
import ProfilePage from './features/profile/components/ProfilePage';
import { useAuth } from './hooks/useAuth';
import { useTheme } from './hooks/useTheme';
import restaurarSesionImg from './assets/restaurar-sesion.png';
import tefiDescansoImg from './assets/tefi-descanso.png';
import tefiDurmiendoImg from './assets/Tefi-durmiendo.png';
import tefiAlmuerzoImg from './assets/tefi-cevichon.png';
import tefiAlmuerzoFestivoImg from './assets/santa-rosa-tefi.png';
import tefiDespidiendoseImg from './assets/Tefi-despidiendose.webp';

const iconoImg = '/Tefiis.png';
const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3005';

function App() {
  // 'chat' es la vista principal: es lo primero que ve un usuario al entrar,
  // lo que abre el logo (home) y lo que queda tras cerrar sesión.
  const [activeView, setActiveView] = useState('chat');
  // Se incrementa al cerrar sesión para remontar los paneles y borrar su estado:
  // si el estudiante deja un reclamo a medias, quien entre después en este mismo
  // navegador no debe encontrarse sus documentos, su conversación ni su avance.
  const [resetKey, setResetKey] = useState(0);

  useTheme();
  const auth = useAuth();
  const [prevView, setPrevView] = useState('chat');
  const [autoIniciarReclamo, setAutoIniciarReclamo] = useState(false);
  const [autoConsultarReclamo, setAutoConsultarReclamo] = useState(false);
  // Cierre de campaña: acabada la matrícula, lo único que queda es consultar el
  // estado de un reclamo ya presentado. Lo enciende el panel; ?despedida=1
  // sigue funcionando para poder verlo en local sin encenderlo de verdad, que
  // el interruptor vive en Supabase y lo comparten producción y desarrollo.
  const [modoDespedida, setModoDespedida] = useState(
    () => new URLSearchParams(window.location.search).get('despedida') === '1'
  );
  const [maintenance, setMaintenance] = useState<boolean | null>(null);
  // Independiente del mantenimiento: mismo efecto (bloquea toda la app), pero
  // propósito y clave propios, así que uno no pisa al otro. Manual, sin
  // horario automático: el mensaje menciona un horario de descanso, pero es
  // solo el texto que lee el estudiante, no algo que el servidor evalúe.
  const [tefiDurmiendo, setTefiDurmiendo] = useState<boolean | null>(null);
  // Modo almuerzo: cierra solo la conversación, nunca los reclamos. Arranca en
  // false y no en null porque no debe retrasar el primer pintado: si la
  // consulta falla o tarda, el chat se muestra con normalidad.
  const [modoAlmuerzo, setModoAlmuerzo] = useState(false);
  // Igual que el almuerzo de todos los días, pero interruptor propio: los dos
  // pueden convivir sin pisarse. Se revisa junto con el almuerzo normal.
  const [modoAlmuerzoFestivo, setModoAlmuerzoFestivo] = useState(false);

  useEffect(() => {
    fetch(`${apiUrl}/api/maintenance`)
      .then(r => r.json())
      .then(d => setMaintenance(!!d.enabled))
      .catch(() => setMaintenance(false));
  }, []);

  // Bloquea la app entera, no una vista concreta, así que no hay un cambio de
  // pestaña al que engancharse como con el almuerzo. Sin volver a preguntar,
  // quien ya tuviera sistema-tefiis abierto seguiría viéndolo todo normal
  // aunque el servidor ya rechace sus reclamos: pediría los datos, los
  // enviaría, y recién ahí se enteraría con un error. El sondeo evita eso.
  useEffect(() => {
    const consultar = () => {
      fetch(`${apiUrl}/api/tefi-durmiendo`)
        .then(r => r.json())
        .then(d => setTefiDurmiendo(!!d.enabled))
        .catch(() => setTefiDurmiendo(false));
    };
    consultar();
    const id = setInterval(consultar, 30_000);
    return () => clearInterval(id);
  }, []);

  // Se sondea igual que Tefi durmiendo y por lo mismo: quien dejara la pestaña
  // abierta antes del cierre seguiría viendo el formulario y solo se enteraría
  // al enviar, con un error. La vista previa por URL no se pisa: si se entró
  // con ?despedida=1 se queda encendida aunque el servidor diga que no.
  //
  // Se manda la sesión porque el cierre admite excepciones por persona: sin el
  // token el servidor no sabe quién pregunta y respondería el estado general.
  // Y depende de sessionToken para volver a preguntar nada más iniciar sesión:
  // el correo con permiso entra a la despedida como todos, y solo al
  // identificarse se le puede abrir.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('despedida') === '1') return;
    const consultar = () => {
      fetch(`${apiUrl}/api/modo-despedida`, {
        headers: auth.sessionToken ? { Authorization: `Bearer ${auth.sessionToken}` } : {},
      })
        .then(r => r.json())
        .then(d => setModoDespedida(!!d.activo))
        .catch(() => setModoDespedida(false));
    };
    consultar();
    const id = setInterval(consultar, 30_000);
    return () => clearInterval(id);
  }, [auth.sessionToken]);

  // Se vuelve a consultar cada vez que se entra en Conversación, no solo al
  // cargar la página: si no, alguien que ya tenía la pestaña abierta cuando se
  // activó el almuerzo seguiría viendo el chat hasta recargar.
  useEffect(() => {
    if (activeView !== 'chat') return;
    fetch(`${apiUrl}/api/modo-almuerzo`)
      .then(r => r.json())
      .then(d => setModoAlmuerzo(!!d.activo))
      .catch(() => setModoAlmuerzo(false));
    fetch(`${apiUrl}/api/modo-almuerzo-festivo`)
      .then(r => r.json())
      .then(d => setModoAlmuerzoFestivo(!!d.activo))
      .catch(() => setModoAlmuerzoFestivo(false));
  }, [activeView]);

  const handleHomeClick = () => {
    // El logo no reinicia resetKey: remontar borraría la conversación y el
    // reclamo en curso de alguien que solo quiso volver al inicio. Ese reinicio
    // se reserva para el cierre de sesión, donde sí se quiere empezar de cero.
    setActiveView('chat');
  };

  const handleSolicitarReclamoDesdeChat = () => {
    setActiveView('reclamos');
    setAutoIniciarReclamo(true);
  };

  if (maintenance === null || tefiDurmiendo === null) return null;

  if (maintenance) {
    return (
      <div className="h-[100dvh] w-full flex flex-col items-center justify-center gap-6 px-4 text-center">
        <img src={tefiDescansoImg} alt="Tefi está descansando" className="w-64 h-64 object-contain" />
        <div>
          <h1 className="text-xl font-bold text-claude-text">Tefi se está tomando un descanso</h1>
          <p className="text-claude-muted text-sm mt-1">Vuelve más tarde.</p>
        </div>
      </div>
    );
  }

  if (tefiDurmiendo) {
    return (
      <div className="h-[100dvh] w-full flex flex-col items-center justify-center gap-6 px-4 text-center">
        <img src={tefiDurmiendoImg} alt="Tefi está durmiendo" className="w-64 h-64 object-contain" />
        <div>
          <h1 className="text-xl font-bold text-claude-text">Tefi está durmiendo, su horario de descanso es desde la 1 a.m. hasta las 8 a.m.</h1>
          <p className="text-claude-muted text-sm mt-1">Tú también deberías ir a dormir :D</p>
        </div>
      </div>
    );
  }

  // La despedida sustituye a la navegación y al contenido, pero NO sale con un
  // return propio: el modal de login se pinta al final de este mismo árbol, y
  // saliendo antes el botón no habría abierto nada.
  // 'perfil' se deja pasar igual que 'reclamos': sin esto, pulsar el avatar
  // devolvía la propia despedida y parecía que el botón no hacía nada. Lo que
  // se ve entonces es un perfil reducido a cerrar sesión.
  const enDespedida = modoDespedida && activeView !== 'reclamos' && activeView !== 'perfil';

  return (
    <div className="h-[100dvh] w-full flex flex-col items-center">

      {enDespedida ? (
        <div className="flex-1 w-full flex flex-col items-center justify-center gap-6 px-4 text-center">
          {/* Ancho y alto automático: el fotograma es apaisado —el portapapeles
              sale volando— y forzarlo a un cuadrado dejaba a Tefi pequeño con
              franjas vacías arriba y abajo. */}
          <img src={tefiDespidiendoseImg} alt="Tefi se despide"
            className="w-72 sm:w-96 max-w-full h-auto object-contain" />
          <p className="text-claude-text text-base sm:text-lg max-w-md leading-relaxed">
            Ha sido un gusto acompañarte en este proceso de matrícula, nos vemos el siguiente ciclo :D
          </p>
          <button
            onClick={() => {
              // Sin sesión no hay nada que consultar: primero el código. Al
              // volver con sesión, este mismo botón ya lleva dentro.
              if (!auth.emailVerificado) { auth.abrirLogin(); return; }
              setAutoConsultarReclamo(true);
              setActiveView('reclamos');
            }}
            className="w-full max-w-xs py-3 rounded-xl bg-claude-text text-claude-bg font-medium text-sm hover:opacity-90 transition-opacity cursor-pointer"
          >
            Consultar el estado de mi reclamo
          </button>
        </div>
      ) : (
      <>
      {/* ── Top Navigation ── */}
      <nav className="w-full flex justify-between items-center px-4 sm:px-6 py-4 sm:py-5 max-w-4xl animate-slide-down">
        {/* Logo */}
        <div onClick={handleHomeClick} className="flex items-center gap-2 sm:gap-3 cursor-pointer group">
          <img src={iconoImg} alt="Icono" className="w-6 h-6 sm:w-7 sm:h-7 object-contain opacity-90 group-hover:opacity-100 transition-opacity" />
          <span className="font-sans font-bold uppercase text-lg sm:text-xl group-hover:text-claude-accent transition-colors">
            TEFIIS
          </span>
        </div>

        {/* Tabs + Login */}
        <div className="flex items-center gap-4 sm:gap-6 text-sm font-medium">
          {auth.emailVerificado && (
            <>
              <button onClick={() => setActiveView('chat')}
                className={`relative py-1 transition-colors ${activeView === 'chat' ? 'text-claude-accent' : 'text-claude-muted hover:text-claude-text'}`}>
                Conversación
                {activeView === 'chat' && <span className="absolute -bottom-1 left-0 right-0 h-0.5 bg-claude-accent rounded-full animate-fade-in" />}
              </button>

              <button onClick={() => setActiveView('reclamos')}
                className={`relative py-1 transition-colors ${activeView === 'reclamos' ? 'text-claude-accent' : 'text-claude-muted hover:text-claude-text'}`}>
                Reclamos
                {activeView === 'reclamos' && <span className="absolute -bottom-1 left-0 right-0 h-0.5 bg-claude-accent rounded-full animate-fade-in" />}
              </button>
            </>
          )}



          {/* ── Sesión ── */}
          {auth.emailVerificado && (
            <button onClick={() => { setPrevView(activeView); setActiveView('perfil'); }}
              className="w-8 h-8 rounded-full bg-claude-accent/20 border border-claude-accent/40 flex items-center justify-center text-xs font-bold text-claude-accent hover:bg-claude-accent/30 transition-colors cursor-pointer">
              {auth.emailVerificado[0].toUpperCase()}
            </button>
          )}
        </div>
      </nav>

      {/* ── Main Content ── */}
      <main className="flex-1 w-full flex flex-col relative px-3 sm:px-4 overflow-hidden pb-6 sm:pb-12 max-w-4xl">
        <div className={`w-full h-full flex flex-col ${activeView === 'chat' ? 'flex' : 'hidden'}`}>
          {modoAlmuerzoFestivo ? (
            <div className="flex-1 w-full max-w-xl mx-auto flex flex-col items-center justify-center gap-5 px-4 text-center">
              <img src={tefiAlmuerzoFestivoImg} alt="Tefi está almorzando con Santa Rosa de Lima" className="w-56 h-56 object-contain" />
              <div>
                <h2 className="text-base sm:text-xl font-bold text-claude-text whitespace-nowrap">Tefi está almorzando con Santa Rosa de Lima</h2>
                <p className="text-claude-muted text-sm mt-2 leading-relaxed">
                  Así que no podrá responder a tus consultas por ahora, pero lo que sí puedes hacer es realizar tu reclamo.
                </p>
              </div>
              <button
                onClick={() => setActiveView('reclamos')}
                className="w-full py-3 rounded-xl bg-claude-text text-claude-bg font-medium text-sm hover:opacity-90 transition-opacity cursor-pointer"
              >
                Ir a Reclamos
              </button>
            </div>
          ) : modoAlmuerzo ? (
            <div className="flex-1 w-full max-w-md mx-auto flex flex-col items-center justify-center gap-5 px-4 text-center">
              <img src={tefiAlmuerzoImg} alt="Tefi está almorzando" className="w-56 h-56 object-contain" />
              <div>
                <h2 className="text-xl font-bold text-claude-text">Tefi está almorzando</h2>
                <p className="text-claude-muted text-sm mt-2 leading-relaxed">
                  No podrá responder a tus consultas por ahora, pero lo que sí puedes hacer es realizar tu reclamo.
                </p>
              </div>
              <button
                onClick={() => setActiveView('reclamos')}
                className="w-full py-3 rounded-xl bg-claude-text text-claude-bg font-medium text-sm hover:opacity-90 transition-opacity cursor-pointer"
              >
                Ir a Reclamos
              </button>
            </div>
          ) : (
            <ChatArea key={resetKey} setView={setActiveView} emailSesion={auth.emailVerificado} sessionToken={auth.sessionToken} onLoginRequired={auth.abrirLogin} onSolicitarReclamo={handleSolicitarReclamoDesdeChat} />
          )}
        </div>
        <div className={`w-full h-full flex flex-col ${activeView === 'reclamos' ? 'flex' : 'hidden'}`}>
          <ReclamosPanel
            key={`reclamos-${resetKey}`}
            emailSesion={auth.emailVerificado}
            sessionToken={auth.sessionToken}
            onLoginRequired={auth.abrirLogin}
            onDocumentsProcessed={() => {}}
            autoIniciar={autoIniciarReclamo}
            onAutoIniciarConsumido={() => setAutoIniciarReclamo(false)}
            autoConsultar={autoConsultarReclamo}
            onAutoConsultarConsumido={() => setAutoConsultarReclamo(false)}
          />
        </div>

        {activeView === 'perfil' && auth.emailVerificado && (
          <ProfilePage
            email={auth.emailVerificado}
            sessionToken={auth.sessionToken}
            onBack={() => setActiveView(prevView)}
            onLogout={() => { auth.cerrarSesion(); setActiveView('chat'); setResetKey(k => k + 1); }}
            soloCerrarSesion={modoDespedida}
          />
        )}
      </main>
      </>
      )}
      {/* ── Login overlay centrado ── */}
      {auth.loginEtapa !== 'cerrado' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-claude-bg/80 backdrop-blur-sm"
          onClick={auth.cerrarLogin}
        >
          <div
            className="w-full max-w-sm mx-4 bg-claude-panel border border-claude-border rounded-2xl p-8 flex flex-col items-center gap-3 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {auth.loginEtapa === 'email' && (
              <>
                <div className="text-center">
                  <h2 className="text-lg font-bold text-claude-text">Iniciar sesión</h2>
                </div>
                <div className="w-full flex flex-col gap-3">
                  <input
                    type="email"
                    placeholder="usuario@uni.pe"
                    value={auth.loginEmail}
                    onChange={e => auth.setLoginEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && auth.handleEnviarCodigo()}
                    autoFocus
                    className="w-full px-4 py-3 rounded-xl bg-claude-bg border border-claude-border text-claude-text text-sm placeholder-claude-muted focus:outline-none focus:border-claude-accent"
                  />
                  {auth.loginError && <p className="text-red-400 text-xs">{auth.loginError}</p>}
                  <button onClick={auth.handleEnviarCodigo} disabled={auth.loginLoading || !auth.loginEmail.trim()}
                    className="w-full py-3 rounded-xl bg-claude-text text-claude-bg text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity cursor-pointer">
                    {auth.loginLoading ? 'Enviando...' : 'Enviar código'}
                  </button>
                </div>
              </>
            )}

            {auth.loginEtapa === 'codigo' && (
              <>
                <div className="text-center">
                  <h2 className="text-lg font-bold text-claude-text">Código enviado</h2>
                  <p className="text-xs text-claude-muted mt-1">Revisa <span className="text-claude-text font-medium">{auth.loginEmail}</span></p>
                </div>
                <div className="w-full flex flex-col gap-3">
                  <input
                    type="text"
                    placeholder="XXXX"
                    maxLength={6}
                    value={auth.loginCodigo}
                    onChange={e => auth.setLoginCodigo(e.target.value.replace(/\D/g, ''))}
                    onKeyDown={e => e.key === 'Enter' && auth.handleVerificarCodigo()}
                    autoFocus
                    className="w-full px-4 py-3 rounded-xl bg-claude-bg border border-claude-border text-claude-text text-center text-3xl font-bold tracking-[0.5em] placeholder-claude-muted focus:outline-none focus:border-claude-accent"
                  />
                  {auth.loginError && <p className="text-red-400 text-xs">{auth.loginError}</p>}
                  <button onClick={auth.handleVerificarCodigo} disabled={auth.loginLoading || auth.loginCodigo.length < 4}
                    className="w-full py-3 rounded-xl bg-claude-text text-claude-bg text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity cursor-pointer">
                    {auth.loginLoading ? 'Verificando...' : 'Verificar'}
                  </button>
                  <button onClick={() => { auth.setLoginCodigo(''); auth.cerrarLogin(); setTimeout(auth.abrirLogin, 50); }}
                    className="text-xs text-claude-muted hover:text-claude-text transition-colors text-center cursor-pointer">
                    Cambiar correo
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Sesión expirada: aviso proactivo, aparece solo por vencimiento ── */}
      {auth.sessionExpired && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-claude-bg/80 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-4 bg-claude-panel border border-claude-border rounded-2xl p-8 flex flex-col items-center gap-4 shadow-2xl text-center">
            <img src={restaurarSesionImg} alt="Sesión expirada" className="w-40 h-40 object-contain" />
            <div>
              <h2 className="text-lg font-bold text-claude-text">Tu sesión ha expirado</h2>
              <p className="text-claude-muted text-sm mt-1">Vuelve a iniciar sesión.</p>
            </div>
            <button
              onClick={() => { auth.cerrarSesion(); setActiveView('chat'); setResetKey(k => k + 1); }}
              className="w-full py-3 rounded-xl bg-claude-text text-claude-bg text-sm font-medium hover:opacity-90 transition-opacity cursor-pointer"
            >
              Volver al inicio
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
