import { useState, useEffect } from 'react';
import { correoPermitido } from '../utils/correosPermitidos';

const STORAGE_KEY = 'tefiis_session_email';
const TOKEN_KEY = 'tefiis_session_token';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3005';

export type AuthEtapa = 'cerrado' | 'email' | 'codigo';

// Lee el "exp" (segundos epoch) del JWT sin verificar la firma — solo para saber
// cuándo expira y avisar proactivamente, no para confiar en su validez.
function getTokenExpiryMs(token: string): number | null {
  try {
    const payloadB64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payloadB64.padEnd(payloadB64.length + (4 - (payloadB64.length % 4)) % 4, '=');
    const payload = JSON.parse(atob(padded));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function useAuth() {
  const [emailVerificado, setEmailVerificado] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY)
  );
  const [sessionToken, setSessionToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_KEY)
  );
  const [loginEtapa, setLoginEtapa] = useState<AuthEtapa>('cerrado');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginCodigo, setLoginCodigo] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  // Se activa solo por vencimiento del token (temporizador), no por una llamada
  // a la API que falle — así el aviso aparece ni bien expira, sin depender de
  // que el estudiante interactúe con la página.
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    if (!sessionToken) return;
    const expiryMs = getTokenExpiryMs(sessionToken);
    if (expiryMs === null) return;

    const checkExpiry = () => {
      if (getTokenExpiryMs(sessionToken)! <= Date.now()) setSessionExpired(true);
    };
    checkExpiry();

    const msRestantes = expiryMs - Date.now();
    const timer = msRestantes > 0 ? setTimeout(checkExpiry, msRestantes) : null;
    // Los timers se pausan en pestañas en segundo plano: al volver a la pestaña
    // revalidamos por si el timeout no llegó a dispararse a tiempo.
    document.addEventListener('visibilitychange', checkExpiry);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', checkExpiry);
    };
  }, [sessionToken]);

  const abrirLogin = () => {
    setLoginEtapa('email');
    setLoginEmail('');
    setLoginCodigo('');
    setLoginError('');
  };

  const cerrarLogin = () => {
    setLoginEtapa('cerrado');
    setLoginError('');
  };

  const handleEnviarCodigo = async () => {
    if (!loginEmail.trim()) return;
    if (!correoPermitido(loginEmail)) {
      setLoginError('Solo se aceptan correos institucionales @uni.pe');
      return;
    }
    setLoginLoading(true);
    setLoginError('');
    try {
      const res = await fetch(`${API_URL}/api/auth/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLoginEtapa('codigo');
    } catch (err: any) {
      setLoginError(err.message);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleVerificarCodigo = async () => {
    if (loginCodigo.length < 4) return;
    setLoginLoading(true);
    setLoginError('');
    try {
      const res = await fetch(`${API_URL}/api/auth/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail.trim(), code: loginCodigo.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const email = loginEmail.trim().toLowerCase();
      setEmailVerificado(email);
      setSessionToken(data.token);
      localStorage.setItem(STORAGE_KEY, email);
      localStorage.setItem(TOKEN_KEY, data.token);
      setLoginEtapa('cerrado');
    } catch (err: any) {
      setLoginError(err.message);
    } finally {
      setLoginLoading(false);
    }
  };

  const cerrarSesion = () => {
    setEmailVerificado(null);
    setSessionToken(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(TOKEN_KEY);
    setLoginEtapa('cerrado');
    setSessionExpired(false);
  };

  return {
    emailVerificado,
    sessionToken,
    sessionExpired,
    loginEtapa,
    loginEmail, setLoginEmail,
    loginCodigo, setLoginCodigo,
    loginLoading,
    loginError,
    abrirLogin,
    cerrarLogin,
    cerrarSesion,
    handleEnviarCodigo,
    handleVerificarCodigo,
  };
}
