import { useCallback, useEffect, useState } from 'react';
import GrillaMes from './GrillaMes.jsx';
import Leyenda from './Leyenda.jsx';
import EstadoVacio from './EstadoVacio.jsx';
import EncabezadoPeriodo from './EncabezadoPeriodo.jsx';
import NavegacionMes from './NavegacionMes.jsx';
import DialogoConfirmarReclasificar from './DialogoConfirmarReclasificar.jsx';

export default function PaginaCalendario({ cliente, inicializarDesdeApp }) {
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
  
  return (
    <>
      {periodoMostrado && ultimo && (
        <NavegacionMes
          periodo={periodoMostrado}
          mesActual={mesActual}
          periodos={periodos}
          generables={generables}
          onIr={cargarMes}
        />
      )}

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
          <GrillaMes dias={estado.vista.dias} onReclasificar={pedirReclasificar} />
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
