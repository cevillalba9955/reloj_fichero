import { fetchConRol } from '../utils/rol-apex.js';

// 018-informe-cierre-periodo — Cliente de datos del informe de cierre. Único
// acceso a datos de la UI: habla solo con `/api` (Principio I). Mismo patrón
// que resumen-periodo-client.js. El identificador de período de la UI
// ('YYYYMM' o 'YYYYMM-Q1'/'Q2') se traduce a `:periodo` + `?tramo=`.

function partesPeriodo(periodo) {
  const m = /^(\d{6})(?:-Q([12]))?$/.exec(periodo ?? '');
  if (!m) return { mes: periodo, tramo: null };
  return { mes: m[1], tramo: m[2] ? `Q${m[2]}` : null };
}

export function crearClienteInformeCierre({ fetchImpl, base = '/api' } = {}) {
  const doFetch = fetchImpl ?? fetchConRol;

  async function pedir(path, opciones) {
    const res = await doFetch(`${base}${path}`, opciones);
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error(body?.error?.mensaje ?? `HTTP ${res.status}`);
      err.status = res.status;
      err.codigo = body?.error?.codigo ?? null;
      throw err;
    }
    return body;
  }

  function ruta(periodo) {
    const { mes, tramo } = partesPeriodo(periodo);
    return `/calendarios/${mes}/informe-cierre${tramo ? `?tramo=${tramo}` : ''}`;
  }

  // 021-informe-asistencia-mensual — ruta del informe mensual unificado
  // (tramo `Mes`), válido en cualquier modo de instalación. `periodo` puede
  // venir con sufijo `-Q1/-Q2`: se descarta y siempre se pide `?tramo=Mes`.
  function rutaMensual(periodo) {
    const { mes } = partesPeriodo(periodo);
    return `/calendarios/${mes}/informe-cierre?tramo=Mes`;
  }

  return {
    // POST → emite / re-emite. Devuelve VistaInformeCierre.
    emitir(periodo) {
      return pedir(ruta(periodo), { method: 'POST' });
    },
    // GET → copia guardada (o error `INFORME_NO_EMITIDO` si nunca se emitió).
    obtener(periodo) {
      return pedir(ruta(periodo));
    },
    // 021 — informe mensual unificado (tramo `Mes`). Lo usa la página
    // Calendario (AccionInformeCierre con la prop `mensual`).
    emitirMensual(periodo) {
      return pedir(rutaMensual(periodo), { method: 'POST' });
    },
    obtenerMensual(periodo) {
      return pedir(rutaMensual(periodo));
    },
  };
}
