import { useState, useRef, useEffect } from 'react';

const INITIAL_MESSAGES = [];

// ── Intención de iniciar un reclamo ─────────────────────────────────────────
// El atajo salta al flujo de Reclamos sin gastar una llamada al LLM, pero al
// hacerlo también se salta las reglas de tema del prompt. Por eso tiene que
// equivocarse hacia el lado seguro: ante la duda no dispara y contesta el
// modelo, que ya sabe rechazar lo que no es de la FIIS. Un falso negativo
// cuesta una llamada; un falso positivo desvía al alumno sin que se entienda
// por qué (era el caso de "quiero un reclamo al creador de esta web").
const PALABRA_RECLAMO = /\breclam(?:o|os|ar|arlo|arla|ando|aci[oó]n|aciones)\b/i;

const VERBO_INTENCION = /\b(quiero|deseo|necesito|quisiera|tengo|puedo|c[oó]mo|hago|hacer|presentar|iniciar|poner|registrar|levantar)\b/i;

const TEMA_ACADEMICO = /\b(matr[ií]cul\w*|nota|notas|calificaci\w*|curso|cursos|asignatura|secci[oó]n|horario|cr[eé]dito|cr[eé]ditos|ciclo|docente|profesor\w*|examen|pr[aá]ctica|acta|constancia|tr[aá]mite|rectificaci\w*|convalidaci\w*|retiro|reserva|boleta|ficha|record|promedio|apto|prerrequisito|vacante|aula|laboratorio|inscripci\w*|pago|tasa|carn[eé]|grado|t[ií]tulo|beca|tutor[ií]a|facultad|fiis|uni)\b/i;

// "reclamo AL creador", "reclamo SOBRE la comida", "reclamo A mi vecino": cuando
// el estudiante dice de qué o contra quién es, ahí se decide si compete a la
// facultad. Sin complemento ("quiero hacer un reclamo") se asume que sí: es la
// forma más común de pedirlo y el flujo de Reclamos ya le pregunta la categoría.
const COMPLEMENTO_RECLAMO = /\breclam\w*\s+(a|al|contra|sobre|por|de|acerca|respecto)\b/i;

function quiereIniciarReclamo(texto: string): boolean {
  if (!PALABRA_RECLAMO.test(texto) || !VERBO_INTENCION.test(texto)) return false;
  if (COMPLEMENTO_RECLAMO.test(texto)) return TEMA_ACADEMICO.test(texto);
  return true;
}

// Detecta un saludo "puro" (sin pregunta real dentro del mismo mensaje) para
// responder siempre igual, sin depender de que el LLM recuerde saludar de vuelta.
const GREETING_TOKEN = /\b(hola+|holi+|hey|buen[oa]s?(\s*(d[ií]as?|tardes?|noches?))?|qu[eé]\s*tal|c[oó]mo\s*(est[aá]s?|and[aá]s?)|tefi)\b/gi;

function esSaludoPuro(texto: string): boolean {
  const limpio = texto.trim();
  if (!limpio) return false;
  const sinPuntuacion = limpio.replace(/[\s,.!¡¿?]+/g, '');
  const sinSaludos = limpio.replace(GREETING_TOKEN, '').replace(/[\s,.!¡¿?]+/g, '');
  return sinSaludos !== sinPuntuacion && sinSaludos.length === 0;
}

function saludoSegunHora(): string {
  const hora = new Date().getHours();
  if (hora < 6) return 'Buenas noches';
  if (hora < 12) return 'Buenos días';
  if (hora < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

// Frase fija que el prompt obliga a usar cuando Tefi rechaza una pregunta fuera de tema.
// La usamos para contar "strikes" sin depender de otra llamada al modelo.
function esRespuestaFueraDeTema(texto: string): boolean {
  return /ayudarte con temas de matr[ií]cula/i.test(texto);
}

// Bloqueo escalonado: 3 min → 10 min → 30 min → 60 min (se mantiene en 60 min de ahí en adelante).
const DURACIONES_BLOQUEO_MIN = [3, 10, 30, 60];
const MAX_STRIKES = 3;

function duracionBloqueoMs(nivel: number): number {
  const minutos = DURACIONES_BLOQUEO_MIN[Math.min(nivel, DURACIONES_BLOQUEO_MIN.length - 1)];
  return minutos * 60 * 1000;
}

interface EstadoModeracion {
  streak: number;
  nivel: number;
  bloqueadoHasta: number | null;
}

function claveModeracion(email?: string | null): string {
  return `tefiis_moderacion_${email || 'anon'}`;
}

function cargarModeracion(email?: string | null): EstadoModeracion {
  try {
    const raw = localStorage.getItem(claveModeracion(email));
    if (raw) return JSON.parse(raw);
  } catch {}
  return { streak: 0, nivel: 0, bloqueadoHasta: null };
}

function guardarModeracion(email: string | null | undefined, estado: EstadoModeracion) {
  try {
    localStorage.setItem(claveModeracion(email), JSON.stringify(estado));
  } catch {}
}

function formatearTiempoRestante(ms: number): string {
  const totalSeg = Math.max(0, Math.ceil(ms / 1000));
  const min = Math.floor(totalSeg / 60);
  const seg = totalSeg % 60;
  return `${min}:${String(seg).padStart(2, '0')}`;
}

export function useChat(email?: string | null, sessionToken?: string | null, onSolicitarReclamo?: () => void) {
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const isSendingRef = useRef(false);
  const conversacionIdRef = useRef(
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  );
  const messagesEndRef = useRef(null);
  const moderacionRef = useRef<EstadoModeracion>(cargarModeracion(email));
  const [bloqueadoHasta, setBloqueadoHasta] = useState<number | null>(moderacionRef.current.bloqueadoHasta);

  // Recargar el estado de moderación si cambia el estudiante logueado.
  useEffect(() => {
    moderacionRef.current = cargarModeracion(email);
    setBloqueadoHasta(moderacionRef.current.bloqueadoHasta);
  }, [email]);

  const guardarYActualizar = (estado: EstadoModeracion) => {
    moderacionRef.current = estado;
    guardarModeracion(email, estado);
    setBloqueadoHasta(estado.bloqueadoHasta);
  };

  const resetOffTopicStreak = () => {
    if (moderacionRef.current.streak !== 0) {
      guardarYActualizar({ ...moderacionRef.current, streak: 0 });
    }
  };

  // Refresca el contador visible cada segundo mientras esté bloqueado, y lo limpia al vencer.
  const [, forzarTick] = useState(0);
  useEffect(() => {
    if (!bloqueadoHasta) return;
    const interval = setInterval(() => {
      if (Date.now() >= bloqueadoHasta) {
        guardarYActualizar({ ...moderacionRef.current, bloqueadoHasta: null });
      } else {
        forzarTick(t => t + 1);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [bloqueadoHasta]);

  const estaBloqueado = !!bloqueadoHasta && Date.now() < bloqueadoHasta;
  const tiempoRestanteTexto = estaBloqueado ? formatearTiempoRestante(bloqueadoHasta! - Date.now()) : null;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = (e) => {
    e?.preventDefault();
    if (!inputValue.trim() || isSendingRef.current) return;

    // Chat bloqueado por preguntas fuera de tema repetidas: no dejamos enviar.
    if (moderacionRef.current.bloqueadoHasta && Date.now() < moderacionRef.current.bloqueadoHasta) {
      return;
    }

    isSendingRef.current = true;

    const questionText = inputValue; // capturar antes de limpiar

    const userMessage = {
      id: Date.now() + '-' + Math.random(),
      role: 'user',
      content: questionText
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');

    // Saludo puro (sin pregunta real): respondemos siempre igual, sin pasar por el LLM.
    if (esSaludoPuro(questionText)) {
      resetOffTopicStreak();
      setMessages(prev => [...prev, {
        id: Date.now() + '-' + Math.random(),
        role: 'assistant',
        content: `¡${saludoSegunHora()}! Soy Tefi. Solo puedo ayudarte con temas de matrícula, reclamos académicos, reglamentos, trámites y procesos de la FIIS-UNI. ¿En qué puedo ayudarte hoy?`
      }]);
      isSendingRef.current = false;
      return;
    }

    // Intención directa de iniciar un reclamo: se le indica dónde hacerlo, sin
    // llevarlo. Antes cambiaba de pestaña solo a los 600 ms, y sacar a alguien
    // de su conversación sin que lo pida desorienta: puede estar a medias de
    // otra cosa. Se sigue atajando aquí para no gastar una llamada al LLM en
    // una respuesta que es siempre la misma.
    if (quiereIniciarReclamo(questionText)) {
      resetOffTopicStreak();
      // Lleva un botón, no un salto automático: el estudiante decide cuándo ir
      // y puede seguir preguntando mientras tanto. La conversación no se pierde
      // al cambiar de pestaña, así que puede volver a ella después.
      setMessages(prev => [...prev, {
        id: Date.now() + '-' + Math.random(),
        role: 'assistant',
        content: 'La sección de **Reclamos** ya está disponible. Puedes ir cuando quieras y te guío paso a paso para registrarlo, o seguir preguntándome aquí.',
        accion: 'ir-a-reclamos',
      }]);
      isSendingRef.current = false;
      return;
    }

    setIsLoading(true);

    setTimeout(async () => {
      try {
        // El prompt y el calendario los pone el backend. Antes viajaban desde
        // aquí en cada mensaje: ~4.000 tokens repetidos por consulta, y
        // cualquiera podía copiar la petición y sustituirlos para usar la
        // cuota de Gemini a su antojo.

        // Filtramos para no enviar el mensaje actual ni el mensaje vacío del asistente que acabamos de crear
        const historyToSent = messages.filter(m => m.content.trim() !== '');
        const formattedHistory = historyToSent.map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          text: m.content
        }));

        const assistantId = Date.now() + '-' + Math.random();
        setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3005';
        const response = await fetch(`${apiUrl}/api/rag/ask`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Se manda la sesión cuando la hay para que el backend pueda
            // atribuir la conversación. Sin ella la pregunta se responde igual:
            // el chat sigue siendo público.
            ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
          },
          body: JSON.stringify({
            question: questionText,
            history: formattedHistory,
            conversacionId: conversacionIdRef.current,
          })
        });

        if (!response.ok) {
          let errorMsg = 'Error al conectar con el servidor RAG local.';
          let motivo = '';
          try {
            const errData = await response.json();
            if (errData && errData.error) errorMsg = errData.error;
            if (errData && errData.motivo) motivo = errData.motivo;
          } catch (e) {}
          // El almuerzo no es un fallo: se muestra tal cual, sin pasar por el
          // manejador de errores que lo confundiría con una caída de Gemini.
          if (motivo === 'almuerzo' || motivo === 'almuerzo_festivo') {
            setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: errorMsg } : m));
            isSendingRef.current = false;
            setIsLoading(false);
            return;
          }
          throw new Error(errorMsg);
        }

        const data = await response.json();

        if (data.success && data.answer) {
          let fullText = data.answer;

          // Limpieza de marcadores de cita (Ej: [cite: 1, 3] o similares)
          fullText = fullText.replace(/\[cite:\s*[\d,\s]+\]/gi, '');
          // Limpieza de "No." por "N°"
          fullText = fullText.replace(/\bNo\.\s+/g, 'N° ');

          fullText = fullText.trim();

          // Contabilizamos "strikes" de respuestas fuera de tema para aplicar el bloqueo escalonado.
          let bloqueoRecienActivado: { minutos: number } | null = null;
          if (esRespuestaFueraDeTema(fullText)) {
            const nuevoStreak = moderacionRef.current.streak + 1;
            if (nuevoStreak >= MAX_STRIKES) {
              const ms = duracionBloqueoMs(moderacionRef.current.nivel);
              guardarYActualizar({ streak: 0, nivel: moderacionRef.current.nivel + 1, bloqueadoHasta: Date.now() + ms });
              bloqueoRecienActivado = { minutos: Math.round(ms / 60000) };
            } else {
              guardarYActualizar({ ...moderacionRef.current, streak: nuevoStreak });
            }
          } else {
            resetOffTopicStreak();
          }

          let currentLength = 0;

          const typingInterval = setInterval(() => {
            currentLength += 3;
            const currentText = fullText.substring(0, currentLength);

            setMessages(prev => prev.map(msg =>
              msg.id === assistantId ? { ...msg, content: currentText } : msg
            ));

            if (currentLength >= fullText.length) {
              clearInterval(typingInterval);
              setMessages(prev => prev.map(msg =>
                msg.id === assistantId ? { ...msg, content: fullText } : msg
              ));
              if (bloqueoRecienActivado) {
                setMessages(prev => [...prev, {
                  id: Date.now() + '-' + Math.random(),
                  role: 'assistant',
                  content: `He notado varias preguntas seguidas fuera de matrícula y reclamos. El chat quedará bloqueado por ${bloqueoRecienActivado.minutos} minutos.`
                }]);
              }
              // Guardar historial
              console.log('[Chat] email al guardar:', email);
              if (email && sessionToken) {
                fetch(`${apiUrl}/api/chat/save`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
                  body: JSON.stringify({ pregunta: questionText, respuesta: fullText })
                })
                  .then(r => r.json())
                  .then(d => console.log('[Chat] historial guardado:', d))
                  .catch(err => console.error('[Chat] error guardando:', err.message));
              } else {
                console.warn('[Chat] no hay email, no se guarda historial');
              }
            }
          }, 15);
        } else {
          throw new Error(data.error);
        }

      } catch (error) {
        console.error("Error from Backend RAG:", error);
        setMessages(prev => {
          let cleanError = error.message;
          if (cleanError.includes('503') || cleanError.includes('UNAVAILABLE') || cleanError.includes('high demand')) {
            cleanError = "Los servidores de Inteligencia Artificial (Gemini) están experimentando una altísima demanda en este momento a nivel mundial. Por favor, intenta preguntar de nuevo en unos segundos.";
          } else if (cleanError.includes('{')) {
            // Si el error es un JSON feo, damos un mensaje genérico
            cleanError = "Error de conexión con el modelo. Por favor intenta de nuevo.";
          }

          // Evitamos mutar directamente el estado para que React Strict Mode no duplique el mensaje
          const newMessages = prev.map(msg => {
            if (msg.role === 'assistant' && msg.content === '') {
              return { ...msg, content: `⚠️ ${cleanError}` };
            }
            return msg;
          });
          
          // Si por alguna razón no había un mensaje de asistente esperando, lo agregamos
          if (!newMessages.find(m => m.role === 'assistant' && m.content.includes(cleanError))) {
             newMessages.push({ id: Date.now(), role: 'assistant', content: `⚠️ ${cleanError}` });
          }
          
          return newMessages;
        });
      } finally {
        setIsLoading(false);
        isSendingRef.current = false;
      }
    }, 500);
  };

  const handleQuickAction = (text) => {
    setInputValue(text);
  };

  return {
    messages,
    inputValue,
    setInputValue,
    isLoading,
    messagesEndRef,
    handleSend,
    handleQuickAction,
    estaBloqueado,
    tiempoRestanteTexto
  };
}
