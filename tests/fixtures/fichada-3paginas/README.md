# Fixture: descarga de 123 fichadas (3 páginas) del software oficial

Bytes crudos del stream TCP entre el **software oficial de Prosoft** (`192.168.1.87`) y un
reloj **RS956** (`192.168.1.78:5005`) descargando **123 fichadas pendientes** (3 páginas del
comando `0xA4`). Es la verdad de referencia (ground truth) de la feature
[006-fix-paginacion-fichadas](../../../specs/006-fix-paginacion-fichadas/spec.md).

## Origen

Capturado en `research/fichada.pcapng` (conservado como fixture probatorio, Constitución
Principio III). El JSON de este directorio se generó con:

```bash
tshark -r research/fichada.pcapng -z follow,tcp,raw,10 -q
```

y se parseó la sección `Follow: tcp,raw` separando por dirección:

- líneas sin sangría → `client_to_device` (comandos del software oficial)
- líneas con tabulación → `device_to_client` (respuestas del reloj)

## Contenido

- `stream10.json` — array `messages` con `{dir, hex}` en orden cronológico. Incluye handshake,
  `0x13` (parámetros/identificación), `0xB4` (conteo = `0x7B` = 123), los **tres** `0xA4`
  (páginas 1/2/3) con sus respuestas, y el cierre `0x81`.

## Datos clave para los tests

Comandos `0xA4` del software oficial (bytes 12–13 = `byteLen` LE):

| Página | `count` (bytes 8–11) | `byteLen` | Regla |
|--------|----------------------|-----------|-------|
| 1 (inicial)      | `0x0000007B` (=123)     | `1024` (`0x0400`) | `pageCount*20 + 4` |
| 2 (continuación) | `0x00010000` (`idx<<16`) | `1024` (`0x0400`) | `pageCount*20 + 4` |
| 3 (última)       | `0x00020000` (`idx<<16`) | `412` (`0x019C`)  | `pageCount*20 - 8` |

El equipo responde siempre `byteLen + 4` bytes de payload tras el marcador `55 AA`.

No editar a mano: regenerar desde el `.pcapng` si hiciera falta.
