# Contrato Web API: Informe de la Primera Quincena antes del Cierre del Mes

**Feature**: 022-informe-primera-quincena-anticipado | **Date**: 2026-09-09

**No hay endpoints nuevos.** Esta feature:

1. Amplía `POST /api/calendarios/:periodo/informe-cierre` para aceptar
   `?tramo=Q1` sobre un período **abierto** dentro de la "ventana de emisión
   anticipada" (modo `QUINCENAL`, calendario generado, primera quincena
   terminada, período no cerrado).
2. Agrega el campo `sello.anticipado` (booleano) a `VistaInformeCierre`.
3. Agrega el campo `emisionAnticipadaQ1Disponible` (booleano) a
   `VistaResumenPeriodo` (`GET /api/resumen-periodo`).

Formas de datos (`VistaInformeCierre`, `InformeResumen`, `InformeDetalle`,
`Pendientes`, `Sello`): ver `specs/018-informe-cierre-periodo/data-model.md`,
más `sello.anticipado`.

Envoltorio de error: estándar del router `{ error: { codigo, mensaje } }`.
Autorización: header `x-apex-rol` → `ctx.rolesConfig.mapear` → `exigirRol`
(feature 016).

---

## `POST /api/calendarios/:periodo/informe-cierre`  (ampliado)

Emite / re-emite un tramo y **reemplaza** la copia guardada. Rol mínimo:
**editor**.

### Cambio de contrato

| Antes (features 018/021) | Ahora (feature 022) |
|--------------------------|---------------------|
| `?tramo` sobre período abierto ⇒ `409 PERIODO_ABIERTO` para todos los tramos | `?tramo=Q1` sobre período **abierto** se acepta si se cumple la ventana anticipada (ver abajo); el resto sigue devolviendo `409 PERIODO_ABIERTO` |
| — | nuevo error `409 QUINCENA_EN_CURSO` cuando `?tramo=Q1` + período abierto + modo QUINCENAL pero la primera quincena aún no terminó |
| entrada guardada sin `sello.anticipado` | `sello.anticipado = true` en la emisión anticipada; `false` en toda emisión de cierre |

### Ventana de emisión anticipada (condiciones, TODAS necesarias)

1. `ctx.modoResumenPeriodo === 'QUINCENAL'`
2. `query.tramo === 'Q1'`
3. el calendario del período existe
4. `calendario.cerrado !== true`
5. `primeraQuincenaTerminada(periodoMes, hoyLocal())` — `hoy` posterior al día
   15 del mes del período

Si 1–4 se cumplen y **5 no** → `409 QUINCENA_EN_CURSO`.
Si la petición no cae en la ventana (otro tramo, modo MENSUAL, período cerrado)
→ se aplica el gate actual (`409 PERIODO_ABIERTO` si el período está abierto).

### Parámetros

| Ubicación | Nombre | Requerido | Formato | Notas |
|-----------|--------|-----------|---------|-------|
| path | `periodo` | sí | `YYYYMM` | mes del período |
| query | `tramo` | condicional | `Q1` \| `Q2` \| `Mes` | la emisión anticipada usa `Q1`. Omitir en `QUINCENAL` sobre período cerrado sigue emitiendo `Q1`+`Q2` |
| body | `autor` | no | string | responsable; va al `Sello` y al log |

### Respuestas

| Código | Cuerpo | Cuándo |
|--------|--------|--------|
| `200` | `VistaInformeCierre` del tramo `Q1` con `sello.anticipado === true`, `sello.modo === 'manual'`, `periodoId === 'YYYYMM-Q1'` | emisión anticipada OK (ventana abierta, período abierto) |
| `200` | `VistaInformeCierre` con `sello.anticipado === false` | emisión/re-emisión sobre período cerrado (flujo 018/021, sin cambios) |
| `400 PERIODO_INVALIDO` | — | `periodo` no es `YYYYMM`; o `?tramo=Q1` en modo `MENSUAL`; o `tramo` fuera de `{Q1,Q2,Mes}` |
| `403 ACCESO_DENEGADO` | — | rol < editor |
| `404 CALENDARIO_NO_GENERADO` | — | el período no tiene calendario |
| `409 QUINCENA_EN_CURSO` | — | `?tramo=Q1` + `QUINCENAL` + período abierto, pero la primera quincena aún no terminó |
| `409 PERIODO_ABIERTO` | — | período abierto y la petición no cae en la ventana anticipada (`?tramo=Q2`/`Mes`/omitido, o modo `MENSUAL`) |
| `500 ERROR_EMITIENDO_INFORME` | — | fallo al calcular/persistir |

### Efectos de la emisión anticipada (`?tramo=Q1`, período abierto)

- Escribe la clave `"Q1"` en `data/P<periodo>/informe-cierre.json` con
  `sello.anticipado = true`, `obsoleto: false`, `invalidadoPor: null`. No crea
  `"Q2"` ni `"Mes"`.
- `logger.evento('informe_cierre_emitido', { periodo, tramo: 'Q1', autor, emision: 'manual', anticipado: true, empleados, totalHoras })`.
- "Reemplaza": llamar dos veces seguidas deja la misma copia salvo
  `sello.emitidoEn`.
- **No** cambia `calendario.cerrado` ni bloquea escrituras sobre los días 1–15
  (FR-011).

---

## `GET /api/calendarios/:periodo/informe-cierre`  (sin cambio de firma)

Devuelve la copia guardada de un tramo. Rol mínimo: **lector** (lectura
abierta). `?tramo=Q1` sobre un período **abierto** ya está permitido hoy
(`debeEstarCerrado: false`).

### Respuestas

| Código | Cuerpo | Cuándo |
|--------|--------|--------|
| `200` | `VistaInformeCierre` con `sello.anticipado` (`true` si la última emisión fue anticipada; `false` si fue de cierre); puede venir `obsoleto: true` tras una reapertura | hay copia guardada del tramo `Q1` |
| `400 PERIODO_INVALIDO` | — | formato inválido |
| `404 CALENDARIO_NO_GENERADO` | — | período sin calendario |
| `404 INFORME_NO_EMITIDO` | — | nunca se emitió el tramo `Q1` (ni anticipado ni de cierre) |

---

## `GET /api/resumen-periodo[?periodo=YYYYMM-Q1|-Q2]`  (ampliado)

Sin cambio de firma. `VistaResumenPeriodo` incorpora un campo:

| Campo | Tipo | Valor |
|-------|------|-------|
| `emisionAnticipadaQ1Disponible` | `boolean` | `true` sii `modo === 'QUINCENAL'` **y** el período efectivo es un tramo `Q1` **y** `cerrado === false` **y** `primeraQuincenaTerminada(periodoMes, hoyLocal())`. `false` en cualquier otro caso (incluye modo `MENSUAL`, tramo `Q2`/`Mes`, período cerrado, Q1 en curso). |

La UI usa este flag para mostrar el botón "Emitir informe de la primera
quincena" en `AccionInformeCierre`. No cambia ningún cálculo.

---

## Impacto en endpoints existentes

- `POST /api/calendarios/:periodo/cerrar` — **sin cambio**. Su emisión
  automática (`emitirInformesDelCierre`) ya escribe `['Q1','Q2','Mes']` en
  QUINCENAL con `emision: 'automatico'`; al no pasar `anticipado`, la entrada
  `Q1` se reescribe con `sello.anticipado = false` (reemplaza la copia
  anticipada previa). FR-012.
- `POST /api/calendarios/:periodo/reabrir` — **sin cambio**. Ya marca
  `obsoleto: true` en todas las entradas del mapa; la clave `Q1` queda
  cubierta.
- `GET /api/calendarios/:periodo` (`VistaCalendarioMes`) — sin cambio. La
  página Calendario **no** ofrece la emisión anticipada (FR-017): sólo los
  informes del mes cerrado.

---

## Contract tests (`tests/contract/web-api-informe-cierre.test.js`, casos nuevos)

Se agregan a la suite existente de las features 018/021.

19. **QUINCENAL — `POST ?tramo=Q1` sobre período ABIERTO con Q1 terminada** →
    `200`; cuerpo con `sello.tramo === 'Q1'`, `sello.anticipado === true`,
    `sello.modo === 'manual'`, `periodoId === '<YYYYMM>-Q1'`, `resumen.filas`,
    `detalle.secciones` (días 1–15), `pendientes`.
20. **QUINCENAL — `GET ?tramo=Q1` tras esa emisión anticipada** → `200`,
    `sello.anticipado === true`, `obsoleto === false`.
21. **QUINCENAL — `POST ?tramo=Q1` sobre período abierto con Q1 EN CURSO**
    (`hoy` ≤ día 15 del mes del período) → `409 QUINCENA_EN_CURSO`; no se
    escribe nada.
22. **QUINCENAL — `POST ?tramo=Q2` sobre período abierto** → `409 PERIODO_ABIERTO`
    (la ventana anticipada es sólo Q1).
23. **QUINCENAL — `POST` sin `?tramo` sobre período abierto** → `409 PERIODO_ABIERTO`
    (comportamiento 018 intacto).
24. **MENSUAL — `POST ?tramo=Q1` sobre período abierto** → `400 PERIODO_INVALIDO`
    (`tramosParaEmitir` no cambia).
25. **`POST ?tramo=Q1` anticipado con rol `lector`** → `403 ACCESO_DENEGADO`.
26. **Cuadre Q1 anticipado vs. "Resumen del Período"**: para cada legajo,
    `informeQ1.resumen.fila[c] === GET /api/resumen-periodo?periodo=<YYYYMM>-Q1 .fila[c]`
    para `c ∈ {horasTrabajadas, completas, incompletas, ausencias, llegadasTarde, retirosAnticipados}`;
    y `Σ informeQ1.resumen.filas[].horasTrabajadas === informeQ1.resumen.encabezado.totalHoras`;
    y por cada sección de `detalle`, `subtotalHoras ===` su fila de resumen.
26b. **Padrón y pendientes del informe anticipado** (SC-004 / SC-005): con un
    fixture que en los días 1–15 tiene una jornada incompleta, un día con
    corrección/justificación y un empleado sin categoría de presentismo →
    `informeQ1.resumen.filas.length === (padrón del período).length` (sin
    omisiones ni duplicados); `informeQ1.pendientes.hayPendientes === true`; el
    día incompleto figura en `pendientes.jornadasIncompletas` (legajo+fecha), el
    día ajustado en `pendientes.ajustes` y el legajo sin categoría en
    `pendientes.anomalias`.
27. **Reemplazo al cerrar**: tras la emisión anticipada de Q1, `POST …/cerrar`;
    `GET ?tramo=Q1` → `200` con `sello.anticipado === false` y
    `sello.modo === 'automatico'`; además `?tramo=Q2` y `?tramo=Mes` → `200`.
28. **Re-emisión anticipada**: dos `POST ?tramo=Q1` anticipados seguidos →
    ambos `200`, `sello.anticipado === true`, sólo cambia `sello.emitidoEn`.
29. **`GET /api/resumen-periodo?periodo=<YYYYMM>-Q1`** con período abierto y Q1
    terminada → `emisionAnticipadaQ1Disponible === true`; con Q1 en curso, con
    período cerrado, o `?periodo=<YYYYMM>-Q2` → `false`.
30. **Emitir anticipado NO bloquea correcciones** (FR-011): tras la emisión
    anticipada de Q1, una corrección sobre un día 1–15 → `200` (no
    `PERIODO_CERRADO`); un `GET ?tramo=Q1` sigue devolviendo la copia previa
    (no se auto-invalida) hasta una nueva emisión.
30b. **Re-emitir refleja el cambio** (SC-008): continuando el caso 30, un
    segundo `POST ?tramo=Q1` anticipado → `200`, y en la copia nueva la
    `resumen.fila.horasTrabajadas` del legajo corregido (y el día
    correspondiente del `detalle`) reflejan el valor corregido — difieren de la
    copia previa a la corrección en el delta esperado.

### Unit test del dominio (`tests/unit/` o junto a `periodo-liquidacion`)

31. **`primeraQuincenaTerminada(periodoMes, hoy)`**: `('202609','2026-09-15') → false`;
    `('202609','2026-09-16') → true`; `('202609','2026-10-01') → true`;
    `('202610','2026-09-30') → false`.
