# Contract: Persistencia de fichadas del servicio

**Feature**: 005 | Consumidores: servicio (scheduler) como productor; `calcular` como lector.

## Sink de persistencia (inyectado en el scheduler)

```
persistirFichadas(fichadas: ParsedFichada[]) => void | Promise<void>
```

- `ParsedFichada`: objeto tal cual devuelve `parseFichadaRecord`
  (`{ legajo, fecha, hora, metodo, rawHex, … }`).
- **Semántica**: agrupa por `periodo` (`fecha`→`YYYYMM`; `fecha` null → período de la fecha de
  recolección) y hace upsert de cada grupo en el archivo del período.
- **Idempotencia**: repetir el mismo conjunto no agrega duplicados (dedup por `rawHex`).
- **Errores**: puede lanzar; el scheduler captura, registra el ciclo como `error` y reintenta
  en el próximo ciclo (FR-004). Nunca se descartan fichadas por un fallo transitorio.
- **Concurrencia**: se invoca dentro del lock single-flight del scheduler (nunca en paralelo).
- **Acoplamiento**: el scheduler NO conoce el sink concreto; se arma en el composition root
  (`src/cli/consulta-programada.js`). Si no se inyecta, el servicio no persiste (comportamiento
  legacy).

## Integración en el scheduler

- Tras un ciclo con `resultado: 'success'`, si hay `persistirFichadas` y el ciclo trajo
  registros, se persisten **todas** las fichadas parseadas del ciclo (no solo las nuevas del
  store) — la dedup del archivo hace el reintento idempotente.
- El log de ciclo (`service-*.ndjson`) sigue con su esquema actual; **nunca** incluye `rawHex`
  (Principio V). Un fallo de persistencia se refleja como ciclo `error` con `detail` de
  diagnóstico (sin bytes crudos).

## Archivo acumulativo por período (reusa feature 004)

- Ruta: `<PRESENTISMO_FICHADAS_DIR>/<periodo>.json` (default `./data/presentismo/fichadas`).
- Escritura **atómica** (temp + rename). **Salta** la escritura si el ciclo no agrega altas.
- Formato y dedup por `rawHex`: los define `registrarFichadas`
  ([file-fichadas-archive.js](../../../src/presentismo/adapters/file-fichadas-archive.js)); esta
  feature agrega la atomicidad y el salto-sin-altas.
- Es la **misma** fuente que lee `archive-fichadas-provider` para `calcular` (round-trip).

## Configuración

| Variable | CLI | Default | Notas |
|----------|-----|---------|-------|
| `PRESENTISMO_FICHADAS_DIR` | `--fichadas-archive-dir` | `./data/presentismo/fichadas` | Debe coincidir con la que usa el CLI de presentismo |

## Garantías verificables

- Round-trip: lo que el servicio persiste, `calcular --periodo <YYYYMM>` lo refleja (SC-001).
- Sin duplicados entre ciclos ni reinicios (SC-003). Sin pérdidas ante reinicio (SC-002).
- Ningún `rawHex` ni credencial en logs correlacionables (SC-008).
