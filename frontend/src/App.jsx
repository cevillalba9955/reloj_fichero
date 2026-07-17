import { useCallback, useEffect, useState } from 'react';
import { crearClienteCalendario } from './api/calendario-client.js';
import GrillaMes from './components/GrillaMes.jsx';
import Leyenda from './components/Leyenda.jsx';
import EstadoVacio from './components/EstadoVacio.jsx';
import EncabezadoPeriodo from './components/EncabezadoPeriodo.jsx';
import NavegacionMes from './components/NavegacionMes.jsx';
import DialogoConfirmarReclasificar from './components/DialogoConfirmarReclasificar.jsx';
import PaginaFichadasHoy from './components/PaginaFichadasHoy.jsx';

// feature 007 — Pantalla principal. Orquesta la carga del último mes generado,
// los estados (cargando / con datos / vacío global / vacío de un mes / error),
// la navegación entre meses (US4) y la reclasificación con confirmación (US3).
// El único acceso a datos es el cliente `/api` (Principio I).
// feature 010 — se agrega una navegación mínima de dos pestañas (sin librería
// de ruteo) para alternar entre el calendario y la página "Fichadas de hoy".

// Instancia única a nivel de módulo: un default de parámetro se reevalúa en
// cada render, y una referencia nueva de `cliente` en cada render invalida
// useCallback/useEffect en cascada y dispara un loop infinito de fetch.
const clientePorDefecto = crearClienteCalendario();

export default function App({ cliente = clientePorDefecto, clienteFichadas = undefined }) {
  const [pestania, setPestania] = useState('fichadas-hoy');
  const [estado, setEstado] = useState({ tipo: 'cargando' });
  const [ultimo, setUltimo] = useState(null);
  const [periodos, setPeriodos] = useState([]);
  const [generables, setGenerables] = useState([]);
  const [mesActual, setMesActual] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [dialogo, setDialogo] = useState(null); // { dia, clasificacion }

  const cargarMes = useCallback(
    async (periodo) => {
      setEstado({ tipo: 'cargando' });
      try {
        const vista = await cliente.obtenerCalendario(periodo);
        setEstado({ tipo: 'con-datos', vista });
      } catch (err) {
        if (err.status === 404) setEstado({ tipo: 'vacio-mes', periodo });
        else setEstado({ tipo: 'error', mensaje: err.message, periodo });
      }
    },
    [cliente],
  );

  const inicializar = useCallback(async () => {
    setEstado({ tipo: 'cargando' });
    try {
      const { ultimo: ult, periodos: perds, generables: gen, mesActual: mes } =
        await cliente.listarCalendarios();
      setUltimo(ult);
      setPeriodos(perds ?? []);
      setGenerables(gen ?? []);
      setMesActual(mes ?? null);
      if (!ult) setEstado({ tipo: 'vacio-global' });
      else await cargarMes(ult);
    } catch (err) {
      setEstado({ tipo: 'error', mensaje: err.message });
    }
  }, [cliente, cargarMes]);

  useEffect(() => {
    inicializar();
  }, [inicializar]);

  const periodoMostrado = estado.vista?.periodo ?? estado.periodo ?? null;

  function pedirReclasificar(dia, clasificacion) {
    setAviso(null);
    setDialogo({ dia, clasificacion });
  }

  async function confirmarReclasificacion() {
    const { dia, clasificacion } = dialogo;
    setDialogo(null);
    try {
      const vista = await cliente.reclasificar(periodoMostrado, {
        fecha: dia.fecha,
        clasificacion,
        autor: 'ui',
      });
      setEstado({ tipo: 'con-datos', vista });
    } catch (err) {
      setAviso(`No se pudo reclasificar: ${err.message}`);
    }
  }

  async function generarCalendarioDelPeriodo(periodo) {
    if (!periodo) return;
    setAviso(null);
    try {
      setEstado({ tipo: 'cargando' });
      await cliente.generarCalendario(periodo);
      // Refrescar la frontera completa: la generación corre el rango y cambia
      // qué períodos quedan generables (feature 008).
      const { ultimo: ult, periodos: perds, generables: gen, mesActual: mes } =
        await cliente.listarCalendarios();
      setUltimo(ult ?? null);
      setPeriodos(perds ?? []);
      setGenerables(gen ?? []);
      setMesActual(mes ?? null);
      await cargarMes(periodo);
    } catch (err) {
      setAviso(`No se pudo generar el calendario: ${err.message}`);
      await inicializar();
    }
  }

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
        {pestania === 'calendario' && periodoMostrado && ultimo && (
          <NavegacionMes
            periodo={periodoMostrado}
            mesActual={mesActual}
            periodos={periodos}
            generables={generables}
            onIr={cargarMes}
          />
        )}
      </header>

      {pestania === 'fichadas-hoy' && <PaginaFichadasHoy cliente={clienteFichadas} />}

      {pestania === 'calendario' && (
      <>
      {aviso && (
        <p className="aviso" role="alert">
          {aviso}
        </p>
      )}

      {estado.tipo === 'cargando' && (
        <p className="cargando" role="status">
          Cargando…
        </p>
      )}

      {estado.tipo === 'error' && (
        <div className="error" role="alert">
          <p>Ocurrió un error: {estado.mensaje}</p>
          <button type="button" onClick={inicializar}>
            Reintentar
          </button>
        </div>
      )}

      {estado.tipo === 'vacio-global' && (
        <EstadoVacio
          mensaje="Aún no se generó ningún calendario."
          periodo={mesActual}
          generables={generables}
          onGenerar={() => generarCalendarioDelPeriodo(mesActual)}
        />
      )}

      {estado.tipo === 'vacio-mes' && (
        <EstadoVacio
          mensaje={`El calendario del período ${estado.periodo} aún no fue generado.`}
          periodo={estado.periodo}
          generables={generables}
          onGenerar={() => generarCalendarioDelPeriodo(estado.periodo)}
        />
      )}

      {estado.tipo === 'con-datos' && (
        <section className="calendario">
          <EncabezadoPeriodo periodoActivo={estado.vista.periodoActivo} />
          <Leyenda items={estado.vista.leyenda} />
          <GrillaMes dias={estado.vista.dias} onReclasificar={pedirReclasificar} />
        </section>
      )}

      {dialogo && (
        <DialogoConfirmarReclasificar
          dia={dialogo.dia}
          clasificacion={dialogo.clasificacion}
          onConfirmar={confirmarReclasificacion}
          onCancelar={() => setDialogo(null)}
        />
      )}
      </>
      )}
    </main>
  );
}
