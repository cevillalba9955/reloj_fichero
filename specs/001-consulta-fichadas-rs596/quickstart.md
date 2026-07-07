# Quickstart: Consulta de Fichadas del Reloj RS596

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Guía para validar que la feature funciona de punta a punta, una vez
implementada. No incluye código de implementación — ver `tasks.md`
(generado por `/speckit-tasks`) para el detalle de construcción.

## Prerrequisitos

- Node.js 20+ instalado.
- Acceso de red al reloj RS596 (misma LAN, puerto `5005` alcanzable) **o**
  un mock TCP server basado en las fixtures de `tests/contract/fixtures/`
  para validar sin hardware real.
- El documento `research/protocolo_prosoft_rs596.md` presente en el repo
  (fuente de verdad del protocolo — no se re-implementa nada que no esté
  documentado ahí).

## Validar contra un reloj real

1. Confirmar la IP del reloj (`Menú > Configuración > Red` en el propio
   equipo, según el research doc).
2. Ejecutar:

   ```bash
   node src/cli/consultar-fichadas.js --host <IP_DEL_RELOJ>
   ```

3. **Resultado esperado** (ver [`contracts/cli-contract.md`](./contracts/cli-contract.md)):
   - Código de salida `0`.
   - En consola: cantidad de fichadas pendientes declaradas, cantidad
     exportada, y las rutas del JSON y del log generados.
   - El archivo JSON en `./output/` cumple
     [`contracts/output-schema.json`](./contracts/output-schema.json).
   - El archivo de log en `./logs/` tiene una línea NDJSON por evento de la
     sesión (comandos enviados, respuestas recibidas, cierre).

4. **Verificar no-destructividad** (User Story 3 / SC-004): volver a
   consultar el reloj (por ejemplo repitiendo el paso 2, o con cualquier
   herramienta que lea `0xB4`) y confirmar que la cantidad de fichadas
   pendientes **no cambió** — el script no debe haber borrado nada.

## Validar sin hardware (usando las fixtures de contrato)

1. Levantar el mock TCP server de `tests/integration/` (construido sobre
   las fixtures hex de `tests/contract/fixtures/`, que reproducen los
   ejemplos reales de la sección 6 del research doc: un registro pendiente,
   dos registros pendientes, comando de borrado).
2. Ejecutar el script apuntando a `localhost` y al puerto que exponga el
   mock.
3. Confirmar que el JSON exportado contiene la misma cantidad de registros
   que la fixture simulada, con los campos legibles (`fecha`, `hora`,
   `legajo`, `metodo`) presentes tal como exige `output-schema.json` — cada
   uno con un valor o `null` según haya podido resolverse, nunca un valor
   inventado.

## Correr la suite de tests

```bash
node --test
```

Debe incluir, como mínimo:
- Tests de contrato de `src/protocol/` contra las fixtures reales
  (`tests/contract/`).
- Tests unitarios de framing y parseo de registros (`tests/unit/`).
- Test de integración del flujo CLI completo contra el mock TCP
  (`tests/integration/`).

## Casos límite a ejercitar manualmente al menos una vez

- Reloj sin fichadas pendientes → código de salida `0`, JSON con
  `records: []`.
- Reloj inalcanzable (IP incorrecta) → código de salida `1`, mensaje de
  error distinguible de un resultado exitoso con 0 fichadas.
- (Cuando se pueda probar contra hardware real) Discrepancia entre el
  conteo de `0xB4` y los registros recibidos en `0xA4` → confirmar el
  comportamiento interino de FR-014 y actualizar la spec si el
  comportamiento observado sugiere una lógica distinta.
