import { useCallback, useEffect, useState } from 'react';
import { crearClienteFichadasHoy } from '../api/fichadas-hoy-client.js';
import { crearClienteJustificaciones } from '../api/justificaciones-client.js';
import TablaFichadasHoy from './TablaFichadasHoy.jsx';
import FormularioCorreccion from './FormularioCorreccion.jsx';
import FormularioPausaRetiro from './FormularioPausaRetiro.jsx';
import FormularioJustificacion from './FormularioJustificacion.jsx';
import BotonConsultarReloj from './BotonConsultarReloj.jsx';
import NavegacionDia from './NavegacionDia.jsx';
import Dialogo from './Dialogo.jsx';

// feature 010 — Página "Fichadas de Hoy": carga la vista del día al montar,
// con estados cargando / con-datos / error (reintento) (US1); permite corregir
// horarios por fila con motivo obligatorio, refrescando solo esa fila (US2);
// registrar pausas intermedias o retiros anticipados (US3); y disparar una
// consulta manual de fichadas nuevas al reloj (US4).
// El único acceso a datos es el cliente `/api` (Principio I).

// Instancia única a nivel de módulo (misma razón que App.jsx: un default de
// parámetro nuevo por render invalidaría useCallback/useEffect en cascada).
const clientePorDefecto = crearClienteFichadasHoy();
const clienteJustificacionesPorDefecto = crearClienteJustificaciones();

const ETIQUETA_DIA = {
  Laborable: 'Día laborable',
  'No Laborable': 'Día no laborable',
  Feriado: 'Feriado',
};

export default function PaginaFichadasHoy({
  cliente = clientePorDefecto,
  clienteJustificaciones = clienteJustificacionesPorDefecto,
}) {
  const [estado, setEstado] = useState({ tipo: 'cargando' });
  const [correccion, setCorreccion] = useState(null); // fila en corrección
  const [pausaRetiro, setPausaRetiro] = useState(null); // fila en pausa/retiro
  const [justificacion, setJustificacion] = useState(null); // fila (o {}) en justificación
  const [motivos, setMotivos] = useState([]);
  // US5: día seleccionado (null = hoy del servidor). Solo se navega a fechas
  // que el servidor ofreció en `navegacion` (FR-016/FR-017).
  const [fechaSeleccionada, setFechaSeleccionada] = useState(null);

  // Carga diferida: el catálogo de motivos solo se pide la primera vez que se
  // abre el diálogo de Justificación (evita un fetch en cada carga de página
  // para una acción que puede no usarse).
  async function abrirJustificacion(filaOVacia) {
    if (motivos.length === 0) {
      try {
        const { motivos: activos } = await clienteJustificaciones.obtenerMotivos();
        setMotivos(activos);
      } catch {
        setMotivos([]);
      }
    }
    setJustificacion(filaOVacia);
  }

  const cargar = useCallback(async () => {
    setEstado({ tipo: 'cargando' });
    setCorreccion(null);
    setPausaRetiro(null);
    setJustificacion(null);
    try {
      const vista = await cliente.obtenerFichadasHoy(fechaSeleccionada);
      setEstado({ tipo: 'con-datos', vista });
    } catch (err) {
      setEstado({ tipo: 'error', mensaje: err.message });
    }
  }, [cliente, fechaSeleccionada]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // SC-002: el efecto de una corrección/pausa/retiro se refleja en la fila
  // correspondiente sin recargar toda la página.
  function actualizarFila(fila) {
    setEstado((e) =>
      e.tipo === 'con-datos'
        ? {
            ...e,
            vista: {
              ...e.vista,
              empleados: e.vista.empleados.map((x) => (x.legajo === fila.legajo ? fila : x)),
            },
          }
        : e,
    );
  }

  async function guardarCorreccion({ entrada, salida, motivo }) {
    const fila = await cliente.corregir(correccion.legajo, {
      fecha: estado.vista.fecha,
      entrada,
      salida,
      autor: 'ui',
      motivo,
    });
    actualizarFila(fila);
    setCorreccion(null);
  }

  // US4: una consulta exitosa refresca la vista completa (el servidor ya la
  // devuelve recalculada); un fallo deja la tabla intacta (FR-010).
  async function consultarReloj() {
    const { resultado, fichadasNuevas, vista } = await cliente.consultarReloj();
    if (vista) setEstado({ tipo: 'con-datos', vista });
    return { resultado, fichadasNuevas };
  }

  // US1 (012): guarda la Justificación (día único o rango) y recarga la vista
  // (un rango puede tocar días fuera de la fila actual, así que no alcanza con
  // refrescar una sola fila).
  async function guardarJustificacion({ legajo, fecha, hasta, motivoId }) {
    const resultado = await clienteJustificaciones.crearJustificacion(legajo, {
      fecha,
      hasta,
      motivoId,
      autor: 'ui',
    });
    await cargar();
    return resultado;
  }

  // US3 (012): revierte la Justificación vigente de la fila y recarga la vista.
  async function revertirJustificacion(fila) {
    await clienteJustificaciones.revertirJustificacion(fila.legajo, {
      fecha: estado.vista.fecha,
      autor: 'ui',
    });
    await cargar();
  }

  async function guardarPausaRetiro({ modo, desde, hasta, hora, motivo }) {
    const fecha = estado.vista.fecha;
    const fila =
      modo === 'pausa'
        ? await cliente.agregarPausa(pausaRetiro.legajo, { fecha, desde, hasta, autor: 'ui', motivo })
        : await cliente.registrarRetiroAnticipado(pausaRetiro.legajo, { fecha, hora, autor: 'ui', motivo });
    actualizarFila(fila);
    setPausaRetiro(null);
  }

  return (
    <section className="fichadas-hoy">
      {estado.tipo === 'cargando' && (
        <p className="cargando" role="status">
          Cargando…
        </p>
      )}

      {estado.tipo === 'error' && (
        <div className="error" role="alert">
          <p>Ocurrió un error: {estado.mensaje}</p>
          <button type="button" onClick={cargar}>
            Reintentar
          </button>
        </div>
      )}

      {estado.tipo === 'con-datos' && (
        <>
          <header className="fichadas-encabezado">
            <div className="fichadas-titulo">
              <h2>Fichadas del {estado.vista.fecha}</h2>
              <p className="dia-clasificacion">
                {ETIQUETA_DIA[estado.vista.diaClasificacion] ?? estado.vista.diaClasificacion}
              </p>
            </div>
            {/* Navegación de días a la derecha, mismo patrón que NavegacionMes
                en PaginaCalendario. */}
            <NavegacionDia
              navegacion={estado.vista.navegacion}
              onNavegar={setFechaSeleccionada}
            />
          </header>
          <div className="fichadas-acciones">
            {/* La consulta manual al reloj solo aplica al día actual (FR-008). */}
            {estado.vista.navegacion?.esHoy && <BotonConsultarReloj onConsultar={consultarReloj} />}
            {/* feature 012 — entrada general para justificar un día/rango que
                todavía no aparece en la tabla (por ejemplo, una licencia
                futura planificada con anticipación). */}
            <button type="button" onClick={() => abrirJustificacion({})}>
              Justificar ausencia
            </button>
          </div>
          <TablaFichadasHoy
            empleados={estado.vista.empleados}
            onCorregir={(fila) => {
              setPausaRetiro(null);
              setCorreccion(fila);
            }}
            onPausaRetiro={(fila) => {
              setCorreccion(null);
              setPausaRetiro(fila);
            }}
            onJustificar={(fila) => abrirJustificacion({ ...fila, fecha: estado.vista.fecha })}
            onRevertirJustificacion={revertirJustificacion}
          />
          {/* FR-018: los formularios de edición se abren como diálogo modal;
              Escape / click en el backdrop equivalen a Cancelar. */}
          {correccion && (
            <Dialogo
              etiqueta={`Corregir horarios del legajo ${correccion.legajo}`}
              onCerrar={() => setCorreccion(null)}
            >
              <FormularioCorreccion
                fila={correccion}
                onGuardar={guardarCorreccion}
                onCancelar={() => setCorreccion(null)}
              />
            </Dialogo>
          )}
          {pausaRetiro && (
            <Dialogo
              etiqueta={`Pausa o retiro anticipado del legajo ${pausaRetiro.legajo}`}
              onCerrar={() => setPausaRetiro(null)}
            >
              <FormularioPausaRetiro
                fila={pausaRetiro}
                onGuardar={guardarPausaRetiro}
                onCancelar={() => setPausaRetiro(null)}
              />
            </Dialogo>
          )}
          {justificacion && (
            <Dialogo etiqueta="Justificación de ausencia" onCerrar={() => setJustificacion(null)}>
              <FormularioJustificacion
                fila={justificacion.legajo != null ? justificacion : null}
                motivos={motivos}
                onGuardar={guardarJustificacion}
                onCancelar={() => setJustificacion(null)}
              />
            </Dialogo>
          )}
        </>
      )}
    </section>
  );
}
