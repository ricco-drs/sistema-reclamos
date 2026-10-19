import { useEffect, useState } from 'react';

const STORAGE_KEY = 'tefiis_admin_theme';

function leerThemeInicial() {
  const guardado = localStorage.getItem(STORAGE_KEY);
  if (guardado === 'light' || guardado === 'dark') return guardado;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function useTheme() {
  const [theme, setTheme] = useState(leerThemeInicial);

  useEffect(() => {
    // Desactiva toda transición CSS durante el cambio de tema para que sea
    // instantáneo y parejo, en vez de que cada elemento se desvanezca a su
    // propio ritmo (cada uno tiene su propio "transition: all 0.2s/0.3s").
    const root = document.documentElement;
    root.classList.add('theme-switching');
    root.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
    const id = requestAnimationFrame(() => {
      root.classList.remove('theme-switching');
    });
    return () => cancelAnimationFrame(id);
  }, [theme]);

  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));

  return { theme, toggleTheme };
}
