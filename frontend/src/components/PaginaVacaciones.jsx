import { useCallback, useEffect, useState } from 'react';
import { crearClienteVacaciones } from '../api/vacaciones-client.js';
import TablaVacaciones from './TablaVacaciones.jsx';
import FormularioAsignarVacaciones from './FormularioAsignarVacaciones.jsx';
import HistorialVacaciones from './HistorialVacaciones.jsx';

// spec 015 — Página "Vacaciones": control anual de saldo/antigüedad (US2),
// asignación de un período (US1) e historial de movimientos (US2) de un
// legajo seleccionado. El único acceso a datos es el cliente `/api`
// (Principio I).

const clientePorDefecto = crearClienteVacaciones();

export default function PaginaVacaciones({ cliente = clientePorDefecto }) {
  const [estado, setEstado] = useState({ tipo: 'cargando' });
  const [seleccionado, setSeleccionado] = useState(null); // fila de TablaVacaciones
  const [historial, setHistorial] = useState(null);

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
    await Promise.all([cargarListado(), cargarHistorial(datos.legajo)]);
    return resultado;
  }

  // spec 015 (US4) — revertir una asignación vigente: repone el saldo y
  // refresca listado + historial, mismo criterio que asignar().
  async function revertir(asignacionId) {
    await cliente.revertir(asignacionId, {});
    await Promise.all([cargarListado(), cargarHistorial(seleccionado.legajo)]);
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
          <TablaVacaciones legajos={estado.legajos} onSeleccionar={setSeleccionado} />

          {seleccionado && (
            <div className="vacaciones-detalle">
              <FormularioAsignarVacaciones
                fila={seleccionado}
                onGuardar={asignar}
                onCancelar={() => setSeleccionado(null)}
              />
              {historial && (
                <>
                  <h3>Historial — legajo {seleccionado.legajo}</h3>
                  <HistorialVacaciones
                    movimientos={historial.movimientos}
                    asignaciones={historial.asignaciones}
                    onRevertir={revertir}
                  />
                </>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
