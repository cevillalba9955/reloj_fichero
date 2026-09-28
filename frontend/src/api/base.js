// Prefijo de la API relativo al `base` de Vite: '/api' en dev y tests,
// '/presentismo/api' en el build de producción (publicado detrás de nginx en
// /presentismo/). BASE_URL siempre termina en '/'.
export const API_BASE = `${import.meta.env.BASE_URL}api`;
