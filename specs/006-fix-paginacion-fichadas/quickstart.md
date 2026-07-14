# Quickstart — Validación de la corrección de paginación (0xA4)

Guía para reproducir el defecto y validar el fix end-to-end. No incluye código de
implementación (ver `tasks.md`).

## Prerrequisitos

- Node.js ≥ 20.12 (`node --version`).
- Repo en la rama `006-fix-paginacion-fichadas`.
- Fixture presente: `tests/fixtures/fichada-3paginas/stream10.json` (derivado de
  `research/fichada.pcapng`). Para regenerarlo hace falta `tshark` (ver el README del fixture);
  los tests NO lo requieren.

## 1. Reproducir el defecto (estado actual, antes del fix)

El síntoma ya está capturado en un output real:

```bash
# Los últimos 21 de 123 registros salen con fecha/hora/legajo nulos o corruptos:
node -e "const d=require('./output/fichadas-192.168.1.78-2026-07-14T10_57_04.272Z.json'); \
  console.log('corruptos:', d.records.filter(r=>r.fecha===null).length, 'de', d.records.length)"
# Esperado (pre-fix): corruptos: 21 de 123
```

## 2. Correr las pruebas de la feature

```bash
npm test
```

Escenarios de aceptación cubiertos:

- **Contrato (SC-003)** — `tests/contract/pagination-0xA4.contract.test.js`: los tres comandos
  `0xA4` generados para el lote de 123 coinciden byte a byte con los del software oficial
  (`byteLen` 1024 / 1024 / 412; `count` 0x7B / 1<<16 / 2<<16).
- **Integración (SC-001/002)** — `tests/integration/paginacion-3-paginas.integration.test.js`:
  se replay-ea `stream10.json` a través de un socket falso; la sesión decodifica **122 fichadas
  únicas**, todas con `fecha/hora/legajo/metodo` válidos, sin duplicados ni faltantes, y
  `overlapCount == 1`.
- **Unit (SC-005)** — `tests/unit/encuadre-sincronizante.test.js`: un flujo sintético de ≥4
  páginas con solapamientos produce exactamente los registros únicos esperados.

## 3. Verificar no-regresión (1 y 2 páginas)

```bash
npm test
# La suite existente de protocolo (framing/records/client-session/query-pending-fichadas)
# debe seguir en verde: cero regresiones (SC-004).
```

## Resultado esperado (post-fix)

- Lote de 123 → 122 fichadas únicas, 0 corruptas, 0 duplicadas.
- Comandos `0xA4` idénticos al software oficial.
- Discrepancia declarado(123) vs. únicos(122) logueada como esperada, sin error.
