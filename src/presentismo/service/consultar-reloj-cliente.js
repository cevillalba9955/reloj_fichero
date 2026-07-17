// feature 010 (research.md §4) — Cliente HTTP local hacia el servidor de
// control del servicio de fichadas (rs956-fichadas.service). El proceso web
// NUNCA abre una conexión al reloj (Principio III): le pide al proceso dueño
// del scheduler que haga un ciclo fuera de horario vía POST /tick en loopback.
// Los errores de conexión (servicio caído, puerto sin escuchar, timeout) se
// mapean a un resultado tipado { ok: false, motivo } — nunca lanzan.

export function createConsultarRelojCliente({
  baseUrl = 'http://127.0.0.1:5006',
  fetchImpl = (...args) => globalThis.fetch(...args),
  timeoutMs = 60_000,
} = {}) {
  async function consultar() {
    let res;
    try {
      res = await fetchImpl(`${baseUrl}/tick`, {
        method: 'POST',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      return { ok: false, motivo: `el servicio de fichadas no responde: ${err.message}` };
    }
    if (!res.ok) {
      return { ok: false, motivo: `el control del servicio de fichadas respondió HTTP ${res.status}` };
    }
    const body = await res.json().catch(() => null);
    if (!body || typeof body.resultado !== 'string') {
      return { ok: false, motivo: 'respuesta inválida del control del servicio de fichadas' };
    }
    // Misma forma que getUltimoCiclo() (contracts/control-api.md): el ciclo del
    // reloj puede haber fallado aunque el POST /tick haya respondido 200.
    return {
      ok: true,
      resultado: body.resultado,
      fichadasNuevas: body.fichadasNuevas ?? 0,
      detail: body.detail ?? null,
    };
  }

  return { consultar };
}
