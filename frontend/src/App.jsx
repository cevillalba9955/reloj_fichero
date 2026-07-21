import { useState } from 'react';
import { crearClienteCalendario } from './api/calendario-client.js';
import PaginaCalendario from './components/PaginaCalendario.jsx';
import PaginaFichadasHoy from './components/PaginaFichadasHoy.jsx';
import { crearClienteFichadasHoy } from './api/fichadas-hoy-client.js';
import PaginaResumenPeriodo from './components/PaginaResumenPeriodo.jsx';
import { crearClienteResumenPeriodo } from './api/resumen-periodo-client.js';
import AppShell from './components/AppShell.jsx';

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
const clienteResumenPeriodoPorDefecto = crearClienteResumenPeriodo();

export default function App({
  clienteCalendario = clienteCalendarioPorDefecto,
  clienteFichadas = clienteFichadasPorDefecto,
  clienteResumenPeriodo = clienteResumenPeriodoPorDefecto,
}) {
  const [pestania, setPestania] = useState('fichadas-hoy');

  return (
    <AppShell seccion={pestania} onCambiarSeccion={setPestania}>
      {pestania === 'fichadas-hoy' && <PaginaFichadasHoy cliente={clienteFichadas} />}

      {pestania === 'calendario' && <PaginaCalendario cliente={clienteCalendario} />}

      {pestania === 'resumen-periodo' && <PaginaResumenPeriodo cliente={clienteResumenPeriodo} />}
    </AppShell>
  );
}
