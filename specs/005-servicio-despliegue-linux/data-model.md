# Data Model: Servicio de Fichadas — Persistencia y Despliegue en Linux

**Feature**: 005-servicio-despliegue-linux | **Date**: 2026-07-13

Esta feature no introduce entidades de dominio nuevas: **reutiliza** las de las features 002
y 004. Se documentan aquí solo las estructuras que la feature produce/consume y las reglas
que agrega.

## §1 — Fichada persistida (registro del archivo por período)

Forma de cada fichada en `data/presentismo/fichadas/<periodo>.json` (definida por la feature
004, producida ahora por el servicio):

| Campo | Tipo | Origen | Notas |
|-------|------|--------|-------|
| `legajo` | entero | `parseFichadaRecord` | legajo del empleado |
| `fecha` | `YYYY-MM-DD` \| null | decodificada del reloj | null = sin fecha determinable (FR-005) |
| `hora` | `HH:MM:SS` \| null | decodificada del reloj | |
| `metodo` | string \| null | decodificada del reloj | huella/rostro/tarjeta |
| `rawHex` | string (hex) | frame crudo de 20 bytes | **identidad de dedup**; dato técnico, NO va a logs (FR-003/FR-016) |

**Reglas**:
- **Deduplicación**: `rawHex` es la clave única. Una fichada con un `rawHex` ya presente en el
  archivo del período NO se agrega de nuevo (FR-002), entre ciclos y entre reinicios (FR-006).
- **Imputación a período**: `periodo = fecha → YYYYMM`; si `fecha` es null, `periodo` se deriva
  de la **fecha de recolección** (`now`), nunca se descarta (FR-005). Coherente con el store en
  memoria de la feature 002.

## §2 — Archivo acumulativo de fichadas por período

Estructura del archivo `<PRESENTISMO_FICHADAS_DIR>/<periodo>.json` (feature 004, sin cambios de
forma):

```json
{
  "periodo": "YYYYMM",
  "actualizadoEn": "ISO-8601",
  "fichadas": [ { "legajo": N, "fecha": "YYYY-MM-DD", "hora": "HH:MM:SS", "metodo": "…", "rawHex": "…" } ]
}
```

**Reglas nuevas (esta feature)**:
- **Escritura atómica**: se escribe a un archivo temporal y se renombra sobre el definitivo, de
  modo que un lector (`calcular`) nunca observe un archivo a medio escribir.
- **Idempotencia por ciclo**: si un ciclo no aporta fichadas nuevas (todas duplicadas), no se
  reescribe el archivo (evita churn; el contenido no cambia).

## §3 — Padrón de empleados activos (fuente archivo)

El lector por archivo acepta **dos esquemas de entrada**:

- **Legacy (feature 002)**: `{ "legajosActivos": [1, 2, 3] }`
- **Snapshot (feature 004)**: `{ "generadoEn": "…", "vista": "…", "empleados": [ { "legajo": N, "categoria": "…", "nombre": "…" } ] }`

**Salida normalizada** (contrato `ActiveEmployeesProvider`, sin cambios): `[{ legajo, activo: true }]`.

**Reglas**:
- Detección por forma: si hay `legajosActivos` (array) se usa ese; si no, si hay `empleados`
  (array) se mapea `empleados[].legajo`; si no hay ninguno → padrón no disponible.
- Normalización única (`interpretarLegajo`): entero ≥ 1; strings solo-dígitos; se **descartan**
  inválidos y se **deduplican** repetidos.
- **Padrón no disponible** (`RosterNoDisponibleError`): archivo ausente, JSON inválido, ninguno
  de los dos esquemas, o cero legajos válidos tras normalizar (FR-015). El servicio lo registra
  como ciclo `error` y sigue; nunca asume padrón vacío.

## §4 — Sink de persistencia (comportamiento, no dato)

`persistirFichadas(fichadas[])`: recibe las fichadas **parseadas** de un ciclo, las agrupa por
`periodo` (regla §1) y hace upsert de cada grupo con `registrarFichadas`. Idempotente por
`rawHex`. Se invoca dentro del lock single-flight del ciclo (nunca concurrente). Un fallo se
propaga para que el ciclo lo registre como `error` y se reintente (FR-004).

## §5 — Unidad de servicio y reinicio diario (config de despliegue)

No es dato de dominio; se especifica en [contracts/systemd-deployment.md](./contracts/systemd-deployment.md).
Parámetros relevantes: `WorkingDirectory` (raíz de instalación, por los paths relativos),
variables de entorno (`.env`), política de reinicio, y el timer diario (`OnCalendar` ~06:00)
que dispara el reinicio del servicio (rollover multi-día, FR-011/FR-012).

## §6 — Relación productor/consumidor

```text
Reloj RS596 ──(TCP, feature 002)──▶ Servicio (scheduler)
                                        │ persistirFichadas (sink, esta feature)
                                        ▼
                         data/presentismo/fichadas/<periodo>.json   ◀── única fuente
                                        ▲
                                        │ archive-fichadas-provider (feature 004)
                                   calcular-presentismo (consumidor)
```
