import { useCallback, useEffect, useState } from 'react';
import { crearClienteFichadasHoy } from '../api/fichadas-hoy-client.js';
import TablaFichadasHoy from './TablaFichadasHoy.jsx';
import FormularioCorreccion from './FormularioCorreccion.jsx';
import FormularioPausaRetiro from './FormularioPausaRetiro.jsx';
import BotonConsultarReloj from './BotonConsultarReloj.jsx';

// feature 010 — Página "Fichadas de Hoy": carga la vista del día al montar,
// con estados cargando / con-datos / error (reintento) (US1); permite corregir
// horarios por fila con motivo obligatorio, refrescando solo esa fila (US2);
// registrar pausas intermedias o retiros anticipados (US3); y disparar una
// consulta manual de fichadas nuevas al reloj (US4).
// El único acceso a datos es el cliente `/api` (Principio I).

// Instancia única a nivel de módulo (misma razón que App.jsx: un default de
// parámetro nuevo por render invalidaría useCallback/useEffect en cascada).
const clientePorDefecto = crearClienteFichadasHoy();

const ETIQUETA_DIA = {
  Laborable: 'Día laborable',
  'No Laborable': 'Día no laborable',
  Feriado: 'Feriado',
};

export default function PaginaFichadasHoy({ cliente = clientePorDefecto }) {
  const [estado, setEstado] = useState({ tipo: 'cargando' });
  const [correccion, setCorreccion] = useState(null); // fila en corrección
  const [pausaRetiro, setPausaRetiro] = useState(null); // fila en pausa/retiro

  const cargar = useCallback(async () => {
    setEstado({ tipo: 'cargando' });
    setCorreccion(null);
    setPausaRetiro(null);
    try {
      const vista = await cliente.obtenerFichadasHoy();
      setEstado({ tipo: 'con-datos', vista });
    } catch (err) {
      setEstado({ tipo: 'error', mensaje: err.message });
    }
  }, [cliente]);

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
            <h2>Fichadas del {estado.vista.fecha}</h2>
            <p className="dia-clasificacion">
              {ETIQUETA_DIA[estado.vista.diaClasificacion] ?? estado.vista.diaClasificacion}
            </p>
            <BotonConsultarReloj onConsultar={consultarReloj} />
          </header>
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
          />
          {correccion && (
            <FormularioCorreccion
              fila={correccion}
              onGuardar={guardarCorreccion}
              onCancelar={() => setCorreccion(null)}
            />
          )}
          {pausaRetiro && (
            <FormularioPausaRetiro
              fila={pausaRetiro}
              onGuardar={guardarPausaRetiro}
              onCancelar={() => setPausaRetiro(null)}
            />
          )}
        </>
      )}
    </section>
  );
}
