# Quickstart — Validación de la paginación por bytes y del ancho del legajo

Guía para reproducir el defecto y validar el fix end-to-end. No incluye código de
implementación (ver `tasks.md`).

## Prerrequisitos

- Node.js ≥ 20.12 (`node --version`).
- Repo en la rama `009-fix-paginacion-0xa4-legajo`.
- Fixture presente: `tests/contract/fixtures/ciento-setenta-y-tres-pendientes-paginado.json`
  (derivado de `research/fichada_2.pcapng`). Para regenerarlo hace falta `tshark`; los tests
  NO lo requieren.
- Opcional, solo para reproducir el defecto contra un equipo real: acceso de red al reloj con
  ≥154 fichadas pendientes.

## 1. Reproducir el defecto (estado previo al fix)

El síntoma ya quedó capturado en un log real de sesión:

```bash
grep '"event":"error"' logs/session-192.168.1.78-2026-07-16T12-52-03-389Z.ndjson
# Esperado (pre-fix): "El stream de fichadas mide 3464 bytes; se esperaban 3460
#  (173 x 20). Payload inesperado (FR-010)."
```

## 2. Correr las pruebas de la feature

```bash
npm test
```

Escenarios de aceptación cubiertos:

- **Integración (SC-001/002/003)** —
  `tests/integration/query-pending-fichadas.integration.test.js`
  ("173 fichadas pendientes pagina 0xA4 en 4 llamadas por bytes"): se ejercen los 4 comandos
  `0xA4` reales del fixture contra un servidor de loopback; la sesión decodifica las **173
  fichadas declaradas**, sin error de payload, incluido el registro partido en la frontera
  entre las páginas 1 y 2 (legajo 1, fecha 2026-07-08).
- **Contrato (SC-004/005)** — `tests/contract/records.contract.test.js` ("parseFichadaRecord
  reporta legajo null si los bytes 2-3 del campo no son 00 00"): un registro sintético con
  bytes altos de legajo distintos de cero reporta `legajo: null`; el fixture de legajo 9999
  sigue decodificando igual (sin regresión).

## 3. Verificar no-regresión (1 a 3 páginas y legajos previos)

```bash
npm test
# La suite completa del protocolo (framing/records/client-session/query-pending-fichadas/
# performance) debe seguir en verde: cero regresiones (SC-003/SC-004).
```

## 4. Validar contra el equipo real (si hay uno disponible con 154+ pendientes)

```bash
node src/cli/consultar-fichadas.js --host <IP_DEL_RELOJ>
```

Resultado esperado (post-fix): `Fichadas pendientes declaradas (0xB4)` ==
`Fichadas exportadas`, sin error de sesión, y el JSON exportado sin ningún `legajo` mayor a
65535 salvo que provenga de un caso con bytes altos distintos de cero (en cuyo caso debe
salir `null`, no un número).

## Resultado esperado (post-fix)

- Lote de 173 → **173 fichadas** exportadas (= declaradas), sin error de payload.
- Los 4 comandos `0xA4` generados coinciden byte a byte, en `byteLen`, con los del software
  oficial (`1024/1024/1024/388`).
- Ninguna fichada real ya vista cambia su `legajo` reportado.
- Un registro sintético con bytes altos de legajo ≠ `00 00` reporta `legajo: null`.
