import { useCallback, useEffect, useState } from 'react';
import GrillaMes from './GrillaMes.jsx';
import Leyenda from './Leyenda.jsx';
import EstadoVacio from './EstadoVacio.jsx';
import EncabezadoPeriodo from './EncabezadoPeriodo.jsx';
import NavegacionMes from './NavegacionMes.jsx';
import DialogoConfirmarReclasificar from './DialogoConfirmarReclasificar.jsx';
import { leerSesion, guardarSesion } from '../utils/sesion-storage.js';
import { useRol } from '../contexto/RolContext.jsx';

// Recuerda el período mostrado entre pestañas (sessionStorage): al volver al
// Calendario por el menú de la izquierda, retoma el mes que se estaba viendo
// en vez de saltar siempre al último generado.
const CLAVE_PERIODO_SESION = 'presentismo.calendario.periodo';

export default function PaginaCalendario({ cliente, inicializarDesdeApp, onIrAFichadas }) {
  const { puede } = useRol();
  const [estado, setEstado] = useState({ tipo: 'cargando' });
  const [ultimo, setUltimo] = useState(null);
  const [periodos, setPeriodos] = useState([]);
  const [generables, setGenerables] = useState([]);
  const [mesActual, setMesActual] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [dialogo, setDialogo] = useState(null); // { dia, clasificacion }

  const cargarMes = useCallback(
    async (periodo) => {
      guardarSesion(CLAVE_PERIODO_SESION, periodo);
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
      else {
        const recordado = leerSesion(CLAVE_PERIODO_SESION);
        const periodoAMostrar = recordado && (perds ?? []).includes(recordado) ? recordado : ult;
        await cargarMes(periodoAMostrar);
      }
    } catch (err) {
      setEstado({ tipo: 'error', mensaje: err.message });
    }
  }, [cliente, cargarMes]);

  useEffect(() => {
    inicializar();
  }, [inicializar]);

  const periodoMostrado = estado.vista?.periodo ?? estado.periodo ?? null;
  // "Cerrar período" solo tiene sentido una vez que el período ya pasó (el mes
  // actual es posterior); "Reabrir período" sigue disponible siempre que el
  // período esté cerrado, sin importar la fecha.
  const periodoYaPaso = Boolean(mesActual && periodoMostrado && periodoMostrado < mesActual);

  async function generarCalendarioDelPeriodo(periodo) {
    if (!periodo) return;
    try {
      setEstado({ tipo: 'cargando' });
      await cliente.generarCalendario(periodo);
      const { ultimo: ult, periodos: perds, generables: gen, mesActual: mes } =
        await cliente.listarCalendarios();
      setUltimo(ult ?? null);
      setPeriodos(perds ?? []);
      setGenerables(gen ?? []);
      setMesActual(mes ?? null);
      await cargarMes(periodo);
    } catch (err) {
      setEstado({ tipo: 'error', mensaje: err.message });
      await inicializar();
    }
  }

  const pedirReclasificar = useCallback((dia, clasificacion) => {
    setAviso(null);
    setDialogo({ dia, clasificacion });
  }, []);

  const confirmarReclasificacion = useCallback(async () => {
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
  }, [dialogo, cliente, periodoMostrado]);

  // 013-reestructurar-data-periodos (US3) — cierra/reabre el período mostrado
  // según su estado actual; refresca la vista con la respuesta del servidor.
  const cerrarOReabrirPeriodo = useCallback(async () => {
    setAviso(null);
    try {
      const vista = estado.vista?.cerrado
        ? await cliente.reabrirPeriodo(periodoMostrado, { autor: 'ui' })
        : await cliente.cerrarPeriodo(periodoMostrado, { autor: 'ui' });
      setEstado({ tipo: 'con-datos', vista });
    } catch (err) {
      setAviso(
        estado.vista?.cerrado
          ? `No se pudo reabrir el período: ${err.message}`
          : `No se pudo cerrar el período: ${err.message}`,
      );
    }
  }, [cliente, periodoMostrado, estado.vista]);

  return (
    <>
      <div className="header-periodo" aria-live="polite">
        <div>
          {estado.tipo === 'con-datos' && (
            <EncabezadoPeriodo periodoActivo={estado.vista.periodoActivo} />
          )}
          {estado.tipo === 'cargando' && (
            <p className="cargando" role="status">
              Cargando…
            </p>
          )}
        </div>

        {periodoMostrado && ultimo && (
          <NavegacionMes
            periodo={periodoMostrado}
            mesActual={mesActual}
            periodos={periodos}
            generables={generables}
            onIr={cargarMes}
          />
        )}
      </div>

      {aviso && (
        <p className="aviso" role="alert">
          {aviso}
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
          // feature 016 (FR-005/FR-011): oculta la acción sin rol Editor o
          // superior — la API ya la rechaza (FR-009).
          onGenerar={puede('editor') ? () => generarCalendarioDelPeriodo(mesActual) : null}
        />
      )}

      {estado.tipo === 'vacio-mes' && (
        <EstadoVacio
          mensaje={`El calendario del período ${estado.periodo} aún no fue generado.`}
          periodo={estado.periodo}
          generables={generables}
          onGenerar={puede('editor') ? () => generarCalendarioDelPeriodo(estado.periodo) : null}
        />
      )}

      {estado.tipo === 'con-datos' && (
        <section className="calendario">
           {estado.vista.cerrado && <div className="encabezado-periodo-cerrado">
              <span className="indicador-periodo-cerrado" role="status">
                Período cerrado
              </span>
              {puede('editor') && (
                <button type="button" onClick={cerrarOReabrirPeriodo}>
                  Reabrir período
                </button>
              )}
            </div>}

           {periodoYaPaso && !estado.vista.cerrado && <div className="encabezado-cierre-periodo">
              <span className="indicador-periodo-cerrado" role="status">
                Período concluido
              </span>
              {puede('editor') && (
                <button type="button" onClick={cerrarOReabrirPeriodo}>
                  Cerrar período
                </button>
              )}
            </div>}
          <GrillaMes
            dias={estado.vista.dias}
            onReclasificar={estado.vista.cerrado || !puede('editor') ? undefined : pedirReclasificar}
            onIrAFichadas={onIrAFichadas}
          />
        </section>
      )}

        {estado.tipo === 'con-datos' && (
        <footer className="footer-calendario" >
          <Leyenda items={estado.vista.leyenda} />
        </footer>
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
  );
}
