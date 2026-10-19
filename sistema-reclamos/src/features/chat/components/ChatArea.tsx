import React, { useMemo, useRef } from 'react';
import { ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import tefiImg from '../../../assets/tefi.png';
import tefiUniImg from '../../../assets/Tefi-uni.png';
import { useChat } from '../hooks/useChat';

interface ChatAreaProps {
  setView?: (view: string) => void;
  emailSesion?: string | null;
  sessionToken?: string | null;
  onLoginRequired?: () => void;
  onSolicitarReclamo?: () => void;
}

const extractNombre = (email: string) => {
  const local = email.split('@')[0];
  const first = local.split('.')[0];
  return first.charAt(0).toUpperCase() + first.slice(1);
};

const getGreetingPersonalizado = (email: string): string => {
  const nombre = extractNombre(email);
  const hora = new Date().getHours();

  // Tono formal y centrado en el trámite: esto lo ve cualquiera que entre, y la
  // mayoría llega con un problema de matrícula encima. "Talento FIIS" se
  // conserva de los saludos originales, que era lo que más sonaba a casa.
  const madrugada = [
    `Buenas madrugadas, ${nombre}. ¿En qué puedo ayudarte?`,
    `${nombre}, estoy disponible. Cuéntame tu consulta.`,
    `Buenas madrugadas, ${nombre}. Dime en qué te apoyo.`,
    `Talento FIIS, ¿en qué puedo ayudarte a esta hora?`,
  ];
  const manana = [
    `Buenos días, ${nombre}. ¿En qué puedo ayudarte?`,
    `Buenos días, ${nombre}. Cuéntame tu consulta sobre matrícula.`,
    `${nombre}, buenos días. Estoy para apoyarte con tu trámite.`,
    `Talento FIIS, buenos días. ¿En qué puedo ayudarte?`,
  ];
  const tarde = [
    `Buenas tardes, ${nombre}. ¿En qué puedo ayudarte?`,
    `Buenas tardes, ${nombre}. Cuéntame tu caso.`,
    `${nombre}, ¿tienes alguna consulta sobre tu matrícula?`,
    `Talento FIIS, buenas tardes. ¿En qué puedo ayudarte?`,
  ];
  const noche = [
    `Buenas noches, ${nombre}. ¿En qué puedo ayudarte?`,
    `Buenas noches, ${nombre}. Cuéntame tu consulta.`,
    `${nombre}, estoy disponible. Dime en qué te apoyo.`,
    `Talento FIIS, buenas noches. ¿En qué puedo ayudarte?`,
  ];

  let pool: string[];
  if (hora < 6) pool = madrugada;
  else if (hora < 12) pool = manana;
  else if (hora < 19) pool = tarde;
  else pool = noche;

  return pool[Math.floor(Math.random() * pool.length)];
};

export default function ChatArea({ emailSesion, sessionToken, onLoginRequired, onSolicitarReclamo }: ChatAreaProps) {
  const {
    messages,
    inputValue,
    setInputValue,
    isLoading,
    messagesEndRef,
    handleSend,
    estaBloqueado,
    tiempoRestanteTexto,
  } = useChat(emailSesion, sessionToken, onSolicitarReclamo);

  // Fijado al montar: no cambia en cada re-render
  const greeting = useMemo(() =>
    emailSesion ? getGreetingPersonalizado(emailSesion) : 'Hola soy Tefi, ¿Cómo te ayudo hoy?',
    [emailSesion]
  );

  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const handleArrowScroll = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const singleLine = !inputValue.includes('\n');
    if (e.key === 'ArrowUp' && singleLine && el.selectionStart === 0) {
      e.preventDefault();
      messagesContainerRef.current?.scrollBy({ top: -120, behavior: 'smooth' });
    }
    if (e.key === 'ArrowDown' && singleLine && el.selectionStart === inputValue.length) {
      e.preventDefault();
      messagesContainerRef.current?.scrollBy({ top: 120, behavior: 'smooth' });
    }
  };

  // If there are no messages, show the initial greeting center layout
  if (messages.length === 0) {

    // Sin sesión: pedir login antes de chatear
    if (!emailSesion) {
      return (
        <div className="flex-1 w-full flex flex-col items-center justify-center -mt-12 sm:-mt-20 animate-fade-up">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-5 mb-8 sm:mb-10 max-w-2xl">
            <img src={tefiUniImg} alt="Tefi" className="w-24 h-24 sm:w-32 sm:h-32 object-contain drop-shadow-xl shrink-0" />
            <h1 className="font-serif text-2xl sm:text-4xl text-claude-text tracking-wide font-normal text-center px-4 sm:px-0">
              Hola, soy Tefi
            </h1>
          </div>
          <p className="text-claude-muted text-sm mb-6 text-center">Inicia sesión con tu correo <span className="text-claude-text">@uni.pe</span> para poder registrar tu reclamo.</p>
          <button
            onClick={onLoginRequired}
            className="px-6 py-3 rounded-xl bg-claude-text text-claude-bg font-medium text-sm hover:opacity-90 transition-opacity cursor-pointer"
          >
            Iniciar sesión
          </button>
        </div>
      );
    }

    return (
      <div className="flex-1 w-full flex flex-col items-center justify-center -mt-12 sm:-mt-20 animate-fade-up">
        {/* max-w-2xl es lo que mantiene esto centrado: sin tope, un saludo
            largo estira la fila al ancho completo y la imagen se va al borde
            izquierdo. Y el texto va centrado para que una segunda línea corta
            ("Cuéntame.") quede bajo la primera y no pegada a la izquierda. */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-5 mb-8 sm:mb-10 max-w-2xl">
          <img src={tefiUniImg} alt="Tefi" className="w-24 h-24 sm:w-32 sm:h-32 object-contain drop-shadow-xl shrink-0" />
          <h1 className="font-serif text-2xl sm:text-4xl text-claude-text tracking-wide font-normal text-center px-4 sm:px-0">
            {greeting}
          </h1>
        </div>

        <div className="w-full max-w-3xl bg-claude-panel border border-claude-border rounded-2xl p-3 sm:p-4 flex flex-col shadow-sm">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend(e);
              }
            }}
            autoFocus
            placeholder="Escribe tu consulta aquí..."
            className="w-full bg-transparent text-claude-text placeholder-claude-muted resize-none focus:outline-none min-h-[80px] sm:min-h-[100px] text-base sm:text-lg custom-scrollbar"
          />

          <div className="flex justify-end items-center mt-2 pt-2 border-t border-claude-border/50">
            <div className="flex items-center gap-3">
              <button
                onClick={handleSend}
                disabled={!inputValue.trim()}
                className="bg-claude-text text-claude-bg px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-opacity hover:opacity-90 cursor-pointer"
              >
                Enviar
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Active chat view
  return (
    <div className="flex-1 w-full max-w-3xl mx-auto flex flex-col h-full mt-2 sm:mt-4">

      {/* Message list */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto custom-scrollbar chat-scroll pb-4 sm:pb-6 flex flex-col gap-6 sm:gap-8">
        {messages.map((msg) => (
          <div key={msg.id} className="flex gap-2 sm:gap-4 animate-msg-in">
            {msg.role === 'assistant' && (
              <img src={tefiImg} alt="Tefi" className="w-9 h-9 sm:w-11 sm:h-11 shrink-0 object-contain drop-shadow-md" />
            )}
            {msg.role === 'user' && (
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded shrink-0 bg-claude-border flex items-center justify-center font-medium text-xs text-claude-muted">
                Tú
              </div>
            )}

            <div className="flex-1 pt-1.5 sm:pt-2 w-full max-w-full overflow-hidden">
              {msg.role === 'assistant' ? (
                <div className="prose prose-p:leading-relaxed prose-pre:bg-claude-border prose-pre:border prose-pre:border-claude-border prose-ul:my-2 prose-li:my-0.5 max-w-none text-[14px] sm:text-[15px] text-claude-text">
                  {msg.content === '' ? (
                    <div className="flex gap-2 items-center mt-2.5 h-6">
                      <div className="w-2 h-2 bg-claude-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-claude-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-claude-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      <span className="text-claude-muted text-sm italic">Pensando...</span>
                    </div>
                  ) : (
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  )}
                  {/* Botón solo en los mensajes que lo piden. Sustituye al salto
                      automático que había antes: sacar a alguien de su
                      conversación sin que lo pida desorienta. */}
                  {msg.accion === 'ir-a-reclamos' && onSolicitarReclamo && (
                    <button
                      onClick={onSolicitarReclamo}
                      className="not-prose mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-claude-text text-claude-bg font-medium text-sm hover:opacity-90 transition-opacity cursor-pointer"
                    >
                      Ir a Reclamos
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-[14px] sm:text-[15px] leading-relaxed text-claude-text">
                  {msg.content}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div className="pt-3 sm:pt-4 bg-claude-bg">
        {estaBloqueado && (
          <div className="mb-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs sm:text-sm text-center">
            Chat bloqueado por preguntas fuera de tema. Podrás escribir de nuevo en <strong>{tiempoRestanteTexto}</strong>.
          </div>
        )}
        <div className="w-full bg-claude-panel border border-claude-border rounded-2xl p-2.5 sm:p-3 flex flex-col">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend(e);
              }
              handleArrowScroll(e);
            }}
            placeholder={estaBloqueado ? 'Chat bloqueado temporalmente...' : 'Escribe tu consulta...'}
            disabled={estaBloqueado}
            className="w-full bg-transparent text-claude-text placeholder-claude-muted resize-none focus:outline-none min-h-[40px] sm:min-h-[44px] max-h-32 text-sm sm:text-base custom-scrollbar disabled:opacity-50"
            rows={1}
          />
          <div className="flex justify-end items-center mt-1.5 sm:mt-2">
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || estaBloqueado}
              className="bg-claude-text text-claude-bg px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-opacity hover:opacity-90 cursor-pointer"
            >
              Enviar
            </button>
          </div>
        </div>
        <div className="text-center mt-2 text-[10px] sm:text-[11px] text-claude-muted">
          Tefi puede cometer errores. Considera verificar la información oficial.
        </div>
      </div>
    </div>
  );
}
