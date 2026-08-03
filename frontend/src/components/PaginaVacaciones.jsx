import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'antd';
import { crearClienteVacaciones } from '../api/vacaciones-client.js';
import TablaVacaciones from './TablaVacaciones.jsx';
import FormularioAsignarVacaciones from './FormularioAsignarVacaciones.jsx';
import HistorialVacaciones from './HistorialVacaciones.jsx';
import Dialogo from './Dialogo.jsx';
import { useRol } from '../contexto/RolContext.jsx';

// spec 015 — Página "Vacaciones": control anual de saldo/antigüedad (US2),
// asignación de un período (US1) e historial de movimientos (US2) de un
// legajo seleccionado. El único acceso a datos es el cliente `/api`
// (Principio I).

const clientePorDefecto = crearClienteVacaciones();

export default function PaginaVacaciones({ cliente = clientePorDefecto }) {
  const { puede } = useRol();
  const [estado, setEstado] = useState({ tipo: 'cargando' });
  const [seleccionado, setSeleccionado] = useState(null); // fila de TablaVacaciones
  const [historial, setHistorial] = useState(null);
  const [asignando, setAsignando] = useState(null); // fila cuya asignación se está editando (modal)
  const [mensajeAsignacion, setMensajeAsignacion] = useState(null); // confirmación mostrada en la página, no en el modal

  const cargarListado = useCallback(async () => {
    setEstado({ tipo: 'cargando' });
    try {
      const { legajos } = await cliente.listar();
      setEstado({ tipo: 'con-datos', legajos });
    } catch (err) {
      setEstado({ tipo: 'error', mensaje: err.message });
    }
  }, [cliente]);

  useEffect(() => {
    cargarListado();
  }, [cargarListado]);

  // Refresca los datos tras asignar/revertir sin pasar por el estado
  // "cargando": ese estado desmonta todo el bloque "con-datos" (tabla +
  // modal de asignación abierto), lo que hacía que el modal se cerrara y
  // volviera a abrirse solo, en blanco, al terminar de asignar.
  const refrescarListado = useCallback(async () => {
    const { legajos } = await cliente.listar();
    setEstado({ tipo: 'con-datos', legajos });
  }, [cliente]);

  const cargarHistorial = useCallback(
    async (legajo) => {
      const detalle = await cliente.consultar(legajo);
      setHistorial(detalle);
    },
    [cliente],
  );

  useEffect(() => {
    if (seleccionado) cargarHistorial(seleccionado.legajo);
    else setHistorial(null);
  }, [seleccionado, cargarHistorial]);

  // Tras asignar, refresca el listado (saldo actualizado) y el historial del
  // legajo seleccionado, sin recargar toda la página (quickstart.md Escenario 5.3).
  async function asignar(datos) {
    const resultado = await cliente.asignar(datos);
    await Promise.all([refrescarListado(), cargarHistorial(datos.legajo)]);
    return resultado;
  }

  // El modal se cierra apenas se confirma la asignación; la confirmación se
  // muestra en la página (no dentro del formulario).
  function cerrarAsignacionConExito(resultado) {
    setAsignando(null);
    setMensajeAsignacion(
      `Asignado del ${resultado.fechaInicio} al ${resultado.fechaFin} ` +
        `(${resultado.cantidadDias} días). Saldo resultante: ${resultado.saldoResultante}.`,
    );
  }

  // spec 015 (US4) — revertir una asignación vigente: repone el saldo y
  // refresca listado + historial, mismo criterio que asignar().
  async function revertir(asignacionId) {
    await cliente.revertir(asignacionId, {});
    await Promise.all([refrescarListado(), cargarHistorial(seleccionado.legajo)]);
  }

  return (
    <section className="vacaciones">
      {estado.tipo === 'cargando' && (
        <p className="cargando" role="status">
          Cargando…
        </p>
      )}

      {estado.tipo === 'error' && (
        <div className="error" role="alert">
          <p>Ocurrió un error: {estado.mensaje}</p>
          <button type="button" onClick={cargarListado}>
            Reintentar
          </button>
        </div>
      )}

      {estado.tipo === 'con-datos' && (
        <>
          <h2>Control de vacaciones anual</h2>

          {mensajeAsignacion && (
            <Alert
              type="success"
              showIcon
              closable
              role="status"
              message={mensajeAsignacion}
              onClose={() => setMensajeAsignacion(null)}
              className="vacaciones-mensaje"
            />
          )}

          <TablaVacaciones
            legajos={estado.legajos}
            onSeleccionar={setSeleccionado}
            onAsignar={
              // feature 016 (FR-005/FR-011): oculta la acción para quien no
              // tiene rol Editor o superior — la API ya lo rechaza (FR-009).
              puede('editor')
                ? (fila) => {
                    setSeleccionado(fila);
                    setAsignando(fila);
                    setMensajeAsignacion(null);
                  }
                : null
            }
            legajoSeleccionado={seleccionado?.legajo ?? null}
          />

          {seleccionado && historial && (
            <div className="vacaciones-detalle">
              <h3>Historial — legajo {seleccionado.legajo}</h3>
              <HistorialVacaciones
                movimientos={historial.movimientos}
                asignaciones={historial.asignaciones}
                onRevertir={puede('editor') ? revertir : null}
              />
            </div>
          )}

          {asignando && (
            <Dialogo
              etiqueta={`Asignar vacaciones — legajo ${asignando.legajo}`}
              onCerrar={() => setAsignando(null)}
            >
              <FormularioAsignarVacaciones
                fila={asignando}
                onGuardar={asignar}
                onExito={cerrarAsignacionConExito}
                onCancelar={() => setAsignando(null)}
              />
            </Dialogo>
          )}
        </>
      )}
    </section>
  );
}
