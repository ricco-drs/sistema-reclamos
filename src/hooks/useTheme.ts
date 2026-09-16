import { useEffect } from 'react';

// sistema-tefiis va siempre en claro. Se quitó el conmutador porque lo usa
// gente muy distinta desde móviles muy distintos, y una sola apariencia es una
// cosa menos que pueda verse mal. El panel de administración conserva el suyo:
// ahí el equipo trabaja horas seguidas y el oscuro sí se agradece.
//
// El tema ya viene puesto en el <html>, para que la primera pintura sea clara.
// Esto solo lo sostiene por si algo lo cambiara en caliente.
export function useTheme() {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    // Se borra la preferencia que hubiera guardado el conmutador anterior: sin
    // esto seguiría ocupando sitio en el navegador de quien ya la tenía.
    localStorage.removeItem('tefiis_theme');
  }, []);
}
