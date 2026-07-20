import { useCallback, useEffect, useState } from 'react';
import { crearClienteResumenPeriodo } from '../api/resumen-periodo-client.js';
import TablaResumenPeriodo from './TablaResumenPeriodo.jsx';
import SelectorPeriodo, { etiquetaPeriodo } from './SelectorPeriodo.jsx';
import DialogoDetalleEmpleado from './DialogoDetalleEmpleado.jsx';

// feature 011 — Página "Resumen del Período": carga la vista del período al
// montar (US1), permite cambiar de período (US3) y abrir el detalle de un
// empleado en un diálogo modal (US2). El único acceso a datos es el cliente
// `/api` (Principio I). Página de solo consulta (FR-010): ninguna acción
// escribe datos.

const clientePorDefecto = crearClienteResumenPeriodo();

export default function PaginaResumenPeriodo({ cliente = clientePorDefecto }) {
  const [estado, setEstado] = useState({ tipo: 'cargando' });
  const [periodoSeleccionado, setPeriodoSeleccionado] = useState(null);
  const [empleadoSeleccionado, setEmpleadoSeleccionado] = useState(null); // fila en detalle

  const cargar = useCallback(async () => {
    setEstado({ tipo: 'cargando' });
    try {
      const vista = await cliente.obtenerResumen(periodoSeleccionado);
      setEstado({ tipo: 'con-datos', vista });
    } catch (err) {
      setEstado({ tipo: 'error', mensaje: err.message });
    }
  }, [cliente, periodoSeleccionado]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <section className="resumen-periodo">
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
          <header className="resumen-encabezado">
            <h2>Resumen del período {etiquetaPeriodo(estado.vista.periodo)}</h2>
            <SelectorPeriodo
              periodos={estado.vista.periodos}
              periodo={estado.vista.periodo}
              onCambiar={setPeriodoSeleccionado}
            />
          </header>
          <TablaResumenPeriodo
            filas={estado.vista.filas}
            onSeleccionar={(fila) => setEmpleadoSeleccionado(fila)}
          />
          {empleadoSeleccionado && (
            <DialogoDetalleEmpleado
              cliente={cliente}
              legajo={empleadoSeleccionado.legajo}
              nombre={empleadoSeleccionado.nombre}
              periodo={estado.vista.periodo}
              onCerrar={() => setEmpleadoSeleccionado(null)}
            />
          )}
        </>
      )}
    </section>
  );
}
