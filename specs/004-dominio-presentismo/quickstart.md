# Quickstart / Guía de Validación: Dominio de Presentismo

**Feature**: 004-dominio-presentismo | **Date**: 2026-07-10

Escenarios ejecutables que prueban la feature de punta a punta. No incluye código de
implementación; referencia contratos ([ports.md](contracts/ports.md),
[categorias-config.schema.md](contracts/categorias-config.schema.md),
[cli-presentismo.md](contracts/cli-presentismo.md)) y el [data-model.md](data-model.md).

## Prerrequisitos

- Node.js 20+ (`node --version`).
- Repositorio clonado; sin dependencias nuevas (`oracledb` ya está en `package.json`).
- Config de categorías: copiar `config/categorias.example.json` → `config/categorias.json`
  y ajustar modalidades/categorías (ver schema).
- Para el cálculo real de plantilla: acceso al padrón Oracle configurado como en la
  feature 003 (`.env` con `RRHH_ORACLE_*`), más `RRHH_ORACLE_COLUMNA_CATEGORIA`. Para
  validar el dominio puro NO hace falta Oracle (se usan fichadas y categorías de prueba).

## 1. Suite automatizada (dominio puro + repositorio)

```bash
npm test
```
**Esperado**: verde. Cubre, entre otros, los Acceptance Scenarios del spec:
- Jornada completa `07:05`/`15:58` → 9:00 (US2-1); tolerancia sin extras `06:40`/`16:25`
  → 9:00 (US2-2); parcial por entrada `08:10`/`16:05` → 7:50 (US2-3); parcial por salida
  `07:15`/`14:00` → 7:00 (US2-4); intermedia ignorada `08:30`/`11:00`/`14:45` → 6:15
  (US2-5); sin fichadas → 0 `Sin fichadas` (US2-6); feriado → 9:00 `Feriado cumplido`
  (US2-7); fichada en `No Laborable` no suma (US2-8).
- Quincenal: dos resúmenes Q1/Q2 y Q1+Q2 = mes (US2-10, SC-012).
- Modalidades distintas con mismas fichadas → resultados según sus parámetros (US2-11).
- Categoría no configurada → sin cálculo + anomalía (US2-12, FR-035).
- Pausa `12:00`–`13:00` sobre 9:00 → 8:00 (US3-6); reversión → 9:00 (US3-7); pausa >
  trabajado → acota a 0 (US3-8); corrección con motivo obligatorio (US3-2/3).

## 2. Calendario del mes (US1)

```bash
node src/cli/calcular-presentismo.js generar-calendario --periodo 202607
node src/cli/calcular-presentismo.js reclasificar --periodo 202607 --fecha 2026-07-09 \
  --clasificacion Feriado --autor validador
```
**Esperado**: se generan 31 días (L–V `Laborable`, S–D `No Laborable`); el 2026-07-09
queda `Feriado`; regenerar no pisa esa reclasificación (FR-006).

## 3. Cálculo de un empleado

```bash
node src/cli/calcular-presentismo.js calcular --periodo 202607 --legajo 1234 --formato tabla
```
**Esperado**: para categoría mensual, un `ResumenPresentismo` con horas esperadas
(incluye el feriado del día 9), horas trabajadas, saldo, conteos y desglose
auto/corregidas/pausas. Para categoría quincenal, dos resúmenes (Q1, Q2).

## 4. Corrección y pausa (US3)

```bash
# Jornada incompleta → corrección con motivo
node src/cli/calcular-presentismo.js correccion --periodo 202607 --legajo 1234 \
  --fecha 2026-07-10 --horas 09:00 --autor validador --motivo "olvido de salida"
# Pausa de almuerzo que descuenta 1 h
node src/cli/calcular-presentismo.js pausa --periodo 202607 --legajo 1234 \
  --fecha 2026-07-13 --desde 12:00 --hasta 13:00 --autor validador --motivo "corte de planta"
```
**Esperado**: la corrección incorpora 9:00 al total y queda registrada (autor/motivo); la
pausa descuenta 1:00 del día 13; un intento sin `--motivo` falla (exit 1, FR-027/040).

## 5. Determinismo (SC-005)

```bash
node src/cli/calcular-presentismo.js calcular --periodo 202607 --legajo 1234 --formato json > /tmp/r1.json
node src/cli/calcular-presentismo.js calcular --periodo 202607 --legajo 1234 --formato json > /tmp/r2.json
diff /tmp/r1.json /tmp/r2.json && echo "DETERMINISTA OK"
```
**Esperado**: sin diferencias.

## 6. Smoke opcional contra Oracle real (categoría)

Solo si `.env` tiene acceso al padrón y `RRHH_ORACLE_COLUMNA_CATEGORIA` definido:
```bash
node --env-file-if-exists=.env src/cli/calcular-presentismo.js calcular --periodo 202607 --formato tabla
```
**Esperado**: se resuelve la categoría de cada legajo activo desde Oracle (solo lectura);
los legajos con categoría no configurada aparecen listados como anomalía, sin frenar al
resto. Ningún dato sensible ni credencial en la salida ni en los logs NDJSON.

## Criterios de aceptación de la validación

- `npm test` verde (Principio IV).
- Escenarios 2–5 reproducen los números del spec al minuto (SC-002).
- Ninguna jornada con horas negativas o por encima de la esperada en el cálculo automático
  (SC-008); ningún total diario negativo tras pausas (SC-015).
- Logs sin datos biométricos ni credenciales (Principio V).
