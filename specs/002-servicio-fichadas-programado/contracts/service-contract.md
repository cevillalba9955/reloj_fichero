# Contrato: módulo del servicio de consulta programada

**Fuente de verdad funcional**: [spec.md](../spec.md) (FR-001 a FR-016).
Este documento formaliza la interfaz en proceso que expone el módulo del
servicio; no hay API HTTP en esta feature (spec, Assumptions).

## Función de arranque

```text
startService(options) -> ServiceHandle
```

| Parámetro | Tipo | Descripción |
|---|---|---|
| `options.host` | string | IP del reloj RS596 (reutiliza el contrato de `001-consulta-fichadas-rs596`). |
| `options.port` | number | Puerto TCP del reloj, `5005` por defecto. |
| `options.checkpoints` | `{ entrada: {horaEsperada, margenMinutos}, salida: {horaEsperada, margenMinutos} }` | Opcional; default `{ entrada: {horaEsperada: "07:00", margenMinutos: 30}, salida: {horaEsperada: "16:00", margenMinutos: 30} }` (FR-002). |
| `options.rosterProvider` | `ActiveEmployeesProvider` | Ver `roster-provider-contract.md`. Obligatorio (FR-005). |
| `options.logDir` | string | Directorio para el log estructurado (FR-015), mismo patrón que `session-logger.js` de feature 001. |
| `options.now` | `() => Date` | Opcional, para inyección de reloj en tests (research.md §2). Default `() => new Date()`. |

Devuelve un `ServiceHandle`:

| Método | Descripción |
|---|---|
| `getState()` | Snapshot síncrono del estado acumulado (ver `state-schema.json`, FR-014). |
| `stop()` | Detiene el temporizador de sondeo; no cierra sesiones en curso a la fuerza (espera a que termine la actual). |

## Códigos de resultado por ciclo (para el log estructurado, FR-015)

| Resultado | Significado |
|---|---|
| `success` | La consulta al reloj se ejecutó y se procesaron sus fichadas (0 o más). |
| `error` | La consulta falló (conexión, timeout, respuesta inesperada) — se registra y se reintenta en el próximo tick (FR-012). |
| `omitido` | El tick no disparó consulta: no había ningún checkpoint abierto, o ya había una consulta en curso (research.md §3). |

## Errores explícitos

| Error | Cuándo se lanza |
|---|---|
| `RosterNoDisponibleError` | `rosterProvider.getActiveEmployees()` falla o no responde; el servicio registra el error (FR-013) y trata el ciclo como `error`, sin asumir un padrón vacío. |

## No incluido en esta feature

- Ningún endpoint HTTP ni servidor web (spec, Assumptions).
- Ningún comando de borrado (`0xA8`) — el servicio nunca lo invoca (FR-016).
- Ninguna escritura a Oracle ni a disco de las fichadas acumuladas (spec,
  Assumptions — almacenamiento en memoria únicamente).
