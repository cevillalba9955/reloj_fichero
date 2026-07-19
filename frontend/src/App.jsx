import { useState } from 'react';
import { crearClienteCalendario } from './api/calendario-client.js';
import PaginaCalendario from './components/PaginaCalendario.jsx';
import PaginaFichadasHoy from './components/PaginaFichadasHoy.jsx';
import { crearClienteFichadasHoy } from './api/fichadas-hoy-client.js';

// feature 007 — Pantalla principal. Orquesta la carga del último mes generado,
// los estados (cargando / con datos / vacío global / vacío de un mes / error),
// la navegación entre meses (US4) y la reclasificación con confirmación (US3).
// El único acceso a datos es el cliente `/api` (Principio I).
// feature 010 — se agrega una navegación mínima de dos pestañas (sin librería
// de ruteo) para alternar entre el calendario y la página "Fichadas de hoy".

// Instancia única a nivel de módulo: un default de parámetro se reevalúa en
// cada render, y una referencia nueva de `clienteCalendario` en cada render invalida
// useCallback/useEffect en cascada y dispara un loop infinito de fetch.
const clienteCalendarioPorDefecto = crearClienteCalendario();
const clienteFichadasPorDefecto = crearClienteFichadasHoy(); // se inyecta desde main.jsx

export default function App({ clienteCalendario = clienteCalendarioPorDefecto, clienteFichadas = clienteFichadasPorDefecto  }) {
  const [pestania, setPestania] = useState('fichadas-hoy');

  return (
    <main className="app">
      <header className="app-header">
        <h1>Presentismo</h1>
        <nav className="pestanias" aria-label="Secciones">
          <button
            type="button"
            className={pestania === 'calendario' ? 'pestania activa' : 'pestania'}
            aria-pressed={pestania === 'calendario'}
            onClick={() => setPestania('calendario')}
          >
            Calendario
          </button>
          <button
            type="button"
            className={pestania === 'fichadas-hoy' ? 'pestania activa' : 'pestania'}
            aria-pressed={pestania === 'fichadas-hoy'}
            onClick={() => setPestania('fichadas-hoy')}
          >
            Fichadas de hoy
          </button>
        </nav>
      </header>

      {pestania === 'fichadas-hoy' && <PaginaFichadasHoy cliente={clienteFichadas} />}

      {pestania === 'calendario' && <PaginaCalendario cliente={clienteCalendario} />}
    </main>
  );
}
