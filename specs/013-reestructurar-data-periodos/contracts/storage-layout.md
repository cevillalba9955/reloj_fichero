# Contract: Layout de Almacenamiento por Período

**Feature**: 013-reestructurar-data-periodos | **Date**: 2026-07-20

Reemplaza el layout descrito en `specs/004-dominio-presentismo/contracts/*` y
`specs/010-fichadas-hoy/*` para el estado operativo en archivo (Principio VI).

## Estructura

```text
<repoDir>/                         # PRESENTISMO_REPO_DIR (default ./data/presentismo)
└── P<periodo>/                    # una carpeta por mes calendario (YYYYMM)
    ├── calendario.json            # CalendarioMes + correcciones + pausas + justificaciones
    ├── fichadas.json              # acumulado de fichadas del período (rawHex incluido, Principio V)
    └── padron.json                # snapshot de empleados vigente para ESE período
```

Ejemplo: el período `202608` vive en `<repoDir>/P202608/`.

## Reglas

- El nombre de carpeta es siempre `P` + el período en formato `YYYYMM` (6 dígitos),
  sin separadores. `listarPeriodos()` sigue devolviendo períodos en formato `YYYYMM`
  (sin el prefijo `P`) hacia el resto del sistema.
- Los tres nombres de archivo (`calendario.json`, `fichadas.json`, `padron.json`)
  son fijos: ningún adaptador ni configuración los renombra.
- `calendario.json` mantiene exactamente la forma `{ calendario, correcciones,
  pausas, justificaciones }` que ya define 004/012, con `calendario.cerrado` y
  `calendario.cierre`/`calendario.reapertura` agregados (ver data-model.md).
- `fichadas.json` mantiene exactamente la forma `{ periodo, actualizadoEn,
  fichadas: [...] }` que ya define `file-fichadas-archive.js` (004).
- `padron.json` mantiene exactamente la forma `{ generadoEn, vista, empleados:
  [...] }` que ya define `guardarSnapshotPadron` (003/004).
- Escritura atómica (temp + rename) por archivo, igual criterio que ya aplican
  `file-presentismo-repository.js` y `file-fichadas-archive.js`: un lector
  concurrente nunca ve un archivo truncado ni a medio escribir.
- `<repoDir>/P<periodo>/` se crea perezosamente (al generar el calendario, al
  incorporar la primera fichada, o al sincronizar el padrón), nunca de antemano.

## Configuración retirada (breaking change deliberado)

- `PRESENTISMO_PADRON_FILE` / `--padron-file`: **eliminado**. El padrón ya no es un
  archivo único configurable; siempre es `P<periodo>/padron.json` bajo `repoDir`.
- `PRESENTISMO_FICHADAS_DIR` / `--fichadas-archive-dir`: **eliminado**. El acumulado
  de fichadas ya no vive en una subcarpeta separada; siempre es
  `P<periodo>/fichadas.json` bajo `repoDir`.
- `PRESENTISMO_REPO_DIR` / `--repo-dir`: se mantiene sin cambios (sigue siendo la
  única raíz configurable).

## Migración de datos existentes

Fuera de alcance de esta feature (spec, Assumptions): los datos del layout anterior
(`<repoDir>/<periodo>.json`, `<repoDir>/fichadas/<periodo>.json`,
`<repoDir>/padron.json` único) no se migran automáticamente. Quien opere el entorno
los recrea (regenerando calendarios y resincronizando el padrón) o los reubica a
mano antes de actualizar.
