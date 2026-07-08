# Protocolo de comunicación — Prosoft RS596 WiFi

**Estado:** Ingeniería inversa parcial, basada en análisis de tráfico de red (Wireshark) entre el software oficial "Gestión de Personal Pro-Soft" y el equipo.

**Última actualización:** 8 de julio de 2026 (§5.18: analizada `research/fichada_id_99.pcapng`, captura real software oficial ↔ equipo con `ID DISPOSITIVO=99` y 53 fichadas pendientes — confirma que el byte 2 de los COMANDOS también es `ID DISPOSITIVO`, no una constante, y descubre paginación real de `0xA4` para lotes grandes; §5.17: decodificado el byte 2 del ACK — es `ID DISPOSITIVO`, no una constante; corregido `parseAckHeader` para no rechazar equipos con `ID DISPOSITIVO != 1`; §5.16: `fecha` y `hora` quedan totalmente decodificados sin ambigüedad; §5.15: `legajo` corregido a entero de 4 bytes; §5.14: retractada la hipótesis sobre el bloque de cierre de `0xA4`; se eliminaron las secciones con hipótesis ya refutadas — AM/PM, criterio de desempate — que llevaban a conclusiones erróneas sobre fichadas nuevas)

**Advertencia:** Este documento no está basado en documentación oficial del fabricante (no existe públicamente). Es el resultado de observar tráfico real. Los campos marcados como "confirmado" fueron validados comparando múltiples capturas; los marcados como "hipótesis" o "sin resolver" son observaciones no verificadas y pueden estar incompletos o ser incorrectos.

---

## 1. Datos de conexión

| Parámetro | Valor |
|---|---|
| Transporte | TCP |
| Puerto | `5005` |
| IP del equipo | Configurable en el propio reloj (`Menú > Configuración > Red`) |
| Autenticación | El software pide usuario/contraseña (ej. `admin` / `88888888`), pero **no se envía por este puerto** — es autenticación local del software contra su propia base de datos, no contra el equipo |

---

## 2. Framing general (estructura de todos los mensajes)

Todos los mensajes usan un marcador fijo de 2 bytes al inicio para distinguir dirección:

| Marcador | Dirección |
|---|---|
| `55 AA` | Software → Reloj (comando) |
| `AA 55` | Reloj → Software (respuesta/ACK) |

### 2.1 Formato de comando (software → reloj)

```
55 AA 01 [CMD] [4 bytes variable] [2 bytes: FF FF o 00 00] [2 bytes: contador de secuencia LE] 00
```

- Byte 2 (`01`): constante observada en todos los comandos
- Byte 3 (`CMD`): código de comando (ver tabla en sección 3)
- El contador de secuencia incrementa en cada mensaje dentro de una misma sesión TCP, en little-endian (`01 00`, `02 00`, `03 00`, ...)

### 2.2 Formato de respuesta/ACK (reloj → software)

Casi todas las respuestas empiezan con un ACK corto:

```
AA 55 [ID DISPOSITIVO, 1 byte] 01 [4 bytes, normalmente 00000000] [2 bytes: mismo contador de secuencia] 00
```

> **Corrección (2026-07-08, ver §5.17):** el byte 2 (documentado hasta ahora
> como parte de una constante `01 01`) **no es constante** — es el
> parámetro `ID DISPOSITIVO` configurado en el equipo (`Menú >
> Configuración`), que el reloj hace eco en cada ACK. Todas las capturas
> previas de este documento vienen de equipos con `ID DISPOSITIVO = 1`, por
> lo que ese byte siempre coincidió por casualidad con el byte 3 (que sí es
> constante `01`), dando la falsa impresión de un par fijo `01 01`. El byte
> 3 sigue siendo constante `01` en todas las capturas, con cualquier `ID
> DISPOSITIVO`.

Cuando el comando requiere devolver datos, el ACK va seguido inmediatamente del marcador `55 AA` y el payload de datos (ver secciones siguientes). Es decir, la respuesta con datos tiene esta forma:

```
AA 55 01 01 [4 bytes] [contador] 00  |  55 AA [payload específico del comando]
```

También aparecen paquetes de solo `00 00 00 00 00 00` (6 bytes) intercalados — parecen ser confirmaciones de nivel TCP/keepalive sin contenido útil.

---

## 3. Comandos identificados

| Código | Nombre (hipótesis) | Confirmado | Descripción |
|---|---|---|---|
| `0x80` | Handshake / apertura de sesión | ✅ | Primer mensaje de toda sesión. El equipo responde con ACK simple. Bytes reales en sección 6.4. |
| `0x13` | Consulta de parámetros del equipo | ✅ | Se envía **tres** veces por sesión (no dos, ver corrección 2026-07-02): 1ª y 3ª vez con la misma trama, respuesta de 64 bytes con parámetros de configuración binarios sin decodificar; 2ª vez con una trama distinta, respuesta de 1040 bytes con el bloque de identificación (ver sección 4). Bytes reales en sección 6.4. |
| `0x81` | Inicio/fin de una operación de sincronización | ✅ | Dos variantes por el byte 4 de la trama: `00` = apertura (usada antes de operaciones como `0xA8`), `01` = cierre (usada al final de toda sesión, incluida la descarga de fichadas — no hay apertura `0x81` antes de `0xB4`/`0xA4` en las capturas revisadas). Bytes reales en sección 6.4. |
| `0xB4` | Consultar fichadas pendientes | ✅ | El reloj responde con un ACK donde uno de los bytes indica la cantidad de registros pendientes (`01`, `02`, etc. — ver ejemplos en sección 5). |
| `0xA4` | Solicitar el detalle de las fichadas pendientes | ✅ | El reloj devuelve el payload con los registros (ver sección 5). |
| `0xA8` | Borrar fichadas ya descargadas | ✅ | Comando corto, sin payload de datos. El equipo responde con ACK simple. Se envuelve en `0x81` apertura/cierre, en una sesión TCP separada de la lectura (ver sección 6.5). **Probado contra el equipo real el 2026-07-02** (autorizado explícitamente por el usuario, prueba única): 3 fichadas pendientes → 0 tras el borrado, confirmado con una consulta `0xB4` posterior. No expuesto por el CLI de esta feature (FR-007 lo excluye deliberadamente del alcance). |
| `0xE9` | Subir nombre de usuario | ✅ | Payload de 196 bytes con el nombre codificado en **UTF-16LE**. Usado al dar de alta empleados desde el software hacia el equipo. |
| `0x98` | Subir legajo/número de usuario | ✅ | Acompaña al comando anterior; trae el número de legajo en ASCII. |
| `0x96` | Confirmación / siguiente ítem de lote | ✅ | Se envía después de cada `0xE9`/`0x98`, con contador incremental — controla el avance registro por registro en una carga masiva de usuarios. |
| `0xC3` | Consultar identificación extendida | ✅ | Payload de 272 bytes con modelo (`RS596-WiFi`), marca, sitio web, número de serie y fecha de firmware — mismo contenido que el bloque de 1040 bytes de `0x13`, en formato más compacto. Los 4 bytes finales son constantes entre sesiones (probable checksum, no timestamp). |
| `0xB2` | **Consultar fecha/hora del equipo** | ✅ | **Confirmado y decodificado por completo — ver sección 5.4.** Devuelve la fecha/hora actual del reloj en un formato de campos separados (no empaquetado), fácil de leer. |

---

## 4. Bloque de identificación del equipo (respuesta al segundo `0x13`, 1040 bytes)

Contiene, en texto plano dentro del binario:

- **Capacidades del equipo** (formato tipo `clave:valor` separado por comas, entre llaves):
  ```
  CommunicationInterfaceId:12_1,CodePage:UTF-16,UDiskBackupFileFormatId:3,
  SupportSetupImages:OK,SetupInfoStructType:10,
  EnrollDataType:{fp,pwd,idcard,face},fpver:128,facever:528
  ```
- **Nombre del modelo**: `RS596-WiFi`
- **Marca**: `ProSoft`
- **Sitio web**: `www.pro-soft.com.ar`
- **Número de serie**: `7712601200185`
- **Fecha** (posiblemente de fabricación o de firmware): `20-01-2026`
- **Identificador secundario** (posible MAC o serial de placa): `C26540509F121637`

El resto del bloque son ceros de relleno (padding fijo a 1040 bytes).

---

## 5. Estructura de un registro de fichada

### 5.1 Secuencia completa para descargar fichadas

```
1. Software → Reloj:  0x80  (handshake)
2. Software → Reloj:  0x13  (x2, trae parámetros + bloque de identificación)
3. Software → Reloj:  0xB4  (¿hay fichadas pendientes?)
   Reloj → Software:  ACK con flag de cantidad pendiente
4. Software → Reloj:  0xA4  (traer detalle)
   Reloj → Software:  payload con N registros de 20 bytes cada uno
5. Software → Reloj:  0x81  (cierre de esta operación)
6. [en otra sesión TCP] Software → Reloj: 0xA8  (borrar lo descargado)
```

### 5.2 Formato del payload de respuesta a `0xA4`

```
[4 bytes: contador de registros o header]  [registro 1: 20 bytes]  [registro 2: 20 bytes]  ...
```

> **Corrección de encuadre (2026-07-03, ver §5.9):** el "header" de 4 bytes
> de arriba no es un valor sin significado — es el campo[4] (legajo) del
> registro 1. El corte correcto de 20 bytes por registro debería empezar 4
> bytes antes de donde el parser actual empieza a leer cada registro (o,
> equivalentemente, el orden real de campos por fichada es
> `[campo4, campo0, campo1, campo2, campo3]`, no
> `[campo0, campo1, campo2, campo3, campo4]`). El campo[4] del último
> registro de la respuesta queda colgando; su significado real es
> desconocido (retractada la hipótesis de que fuera "el legajo de una
> fichada aún no llegada", ver §5.14).

Cada registro de 20 bytes se divide en 5 campos de 4 bytes:

| Campo | Bytes | Confirmado | Descripción |
|---|---|---|---|
| campo[0] | 0–3 | ✅ byte3 (segundo, ver §5.7); ❌ bytes 0-2 | Bytes 0-2 constantes `01 00 00` en todas las capturas vistas, de significado desconocido. Byte 3 es el segundo del evento (binario directo, 0-59) |
| campo[1] | 4–7 | ✅ Completo (ver §5.16) | Año/mes/día/hora/minuto empaquetados: byte0=año (`(byte>>2)+1964`), byte1=mes (nibble alto), byte2=día del mes (bits 0-4) + `hourMod8` (bits 5-7), byte3=minuto (bits 2-7) + bloque de 8 horas (bits 0-1). `F9 71` (año 2026, mes julio) es la combinación vista en casi todas las capturas por ser el período en que se hicieron; cambia con fechas de prueba distintas |
| campo[2] | 8–11 | ✅ (bytes), ❌ (significado) | No es fijo entre sesiones: `00 00 00 01` el 2026-07-02, `00 00 00 02` el 2026-07-03 (§5.8) — mismo valor para todos los registros de un lote, distinto entre lotes. Hipótesis vigente sin confirmar: contador de lote/sesión de descarga. Descartada la hipótesis de que fuera el legajo (§5.6) |
| campo[3] | 12–15 | ✅ Confirmado (parcial) | Varía entre registros con distinto método de verificación: `00 00 00 10`/`00 00 00 30`/`00 00 00 40` (huella/tarjeta/rostro, ver §5.6) |
| campo[4] | 16–19 | ✅ Confirmado (los 4 bytes = legajo, ver §5.9/§5.15) | El bloque completo de 4 bytes, leído little-endian, es el legajo del empleado — el parser actual lo asigna al registro equivocado por un error de encuadre de 4 bytes (ver §5.9); no leer esta fila sin la corrección de encuadre |

> Nota: se confirmó por separado el comando `0xB2` que trae la fecha/hora *actual del equipo* en un formato simple de bytes individuales (ver sección 5.4), distinto del formato de campo[1] de arriba (empaquetado en bits, ver §5.16). Son dos formatos distintos para dos cosas distintas: la hora del reloj vs. el timestamp de cada fichada.

### 5.4 Comando de fecha/hora — decodificado ✅

**Secuencia conectar / consultar hora / desconectar:**

```
1. Software → Reloj:  0x80  (conectar / handshake)
2. Software → Reloj:  0x13  (x2, parámetros + identificación — el software siempre los pide al conectar)
3. Software → Reloj:  0xC3  (identificación extendida, opcional en esta secuencia)
4. Software → Reloj:  0x81  (abre operación)
5. Software → Reloj:  0xB2  (consultar fecha/hora)
   Reloj → Software:  payload de 12 bytes con la fecha/hora actual (ver formato abajo)
6. Software → Reloj:  0x81  (cierra la operación / "desconectar" lógico)
   [cierre de la conexión TCP — no hay un comando explícito de "desconectar", el protocolo simplemente cierra el socket]
```

**Formato de la respuesta a `0xB2` (12 bytes), campo por campo — SIN empaquetado matemático:**

| Offset | Bytes | Campo | Ejemplo capturado | Valor decodificado |
|---|---|---|---|---|
| 0–1 | `EA 07` | Año (uint16 LE) | `EA 07` | 2026 |
| 2 | `07` | Mes | `07` | 7 (julio) |
| 3 | `02` | Día | `02` | 2 |
| 4 | `04` | Día de semana (0=domingo) | `04` | 4 = jueves |
| 5 | `0A` | Hora | `0A` | 10 |
| 6 | `18` | Minuto | `18` | 24 |
| 7 | `26` | Segundo | `26` | 38 |
| 8–11 | `45 02 00 00` | Sin identificar | — | Posibles milisegundos/reservado |

Verificado contra la fecha real del día de la captura (jueves 2 de julio de 2026, ~10:24:38) — **coincide exactamente**, incluyendo el día de la semana.

**Importante:** este formato (byte por campo, año en `uint16` + resto en bytes individuales) es **distinto** del formato usado en los registros de fichada (sección 5.2), que parece usar un empaquetado binario diferente. Confirmar la hora del equipo no resolvió directamente el campo de timestamp de las fichadas, pero da una fórmula de referencia sólida por si el mismo empaquetado `año/mes/día/hora/min/seg en bytes separados` aparece en otras partes del protocolo aún no capturadas.

### 5.6 Dato de calibración real — fichada de prueba vs. software oficial (2026-07-02)

Se descargó en vivo (vía este script, contra `192.168.1.82`) el siguiente
registro real, único pendiente en ese momento:

```
rawHex:  01 00 00 06 F9 71 A2 E1 00 00 00 01 00 00 00 40 35 04 00 00
campo[0]: 01 00 00 06
campo[1]: F9 71 A2 E1
campo[2]: 00 00 00 01
campo[3]: 00 00 00 40   <- metodo de verificacion
campo[4]: 35 04 00 00
```

El software oficial, para esta misma fichada, informó: fecha `02/07/26`,
hora `13:56`, tipo `Entrada`, legajo `1`, id `72`, método **reconocimiento
facial**.

**Método de verificación `0x40` = rostro/facial — confirmado por comparación directa.**
Esto valida, con evidencia externa (no solo inferencia interna), el
significado de uno de los dos valores observados hasta ahora en campo[3]
(`0x10` y `0x40`). Encaja además con una fórmula plausible derivada del
propio equipo: el bloque de identificación (sección 4) declara
`EnrollDataType:{fp,pwd,idcard,face}`; si se numera esa lista 1 a 4 y se
multiplica por `0x10`, da `fp=0x10, pwd=0x20, idcard=0x30, face=0x40` —
coincide exactamente con el valor confirmado. **`0x10 = huella (fp)` queda
como hipótesis fuerte por esta fórmula, pero todavía sin una confirmación
independiente propia** (no se probó una fichada por huella contra el
software oficial). `verificationMethodLabel` en el código sigue
exponiéndose con `unconfirmed: true` para todos los valores, tal como exige
el contrato (`output-schema.json`); esta sección documenta el hallazgo a
nivel de investigación, no cambia esa garantía del código.

**Legajo — hipótesis sobre campo[2], REFUTADA ❌ (ver actualización §5.8):**
en las 4 sesiones reales revisadas hasta ese momento (incluida esta),
campo[2] era siempre `00 00 00 01`, y en las que se conocía el legajo del
empleado (esta y la de la sección 6.1, "Cesar Villalba"), el legajo real era
`1` en ambos casos. En ese momento no había ningún caso de prueba con un
legajo distinto de `1` que permitiera distinguir "campo[2] = legajo del
empleado" de "campo[2] = constante fija sin relación con el legajo". Esa
prueba ya se hizo: `research/control_fichada.csv` (usado en la sección 5.7)
incluye dos fichadas con legajo `2` (filas 1 y 2) tomadas en la misma
sesión que las cinco con legajo `1`, y las siete comparten el mismo
campo[2] = `00 00 00 01` (ver `tests/contract/fixtures/siete-registros-control-fichada.json`).
Esto refuta la hipótesis "campo[2] = legajo": el campo no varía entre
legajos distintos dentro de una misma sesión/lote. Ver sección 5.8 para la
hipótesis vigente (contador de lote/sesión, no de legajo ni de empleado).

**"id: 72" del software:** no se encontró como ninguno de los bytes del
registro (no aparece `0x48` en ningún campo). Es consistente con la
hipótesis ya documentada de que ese id es un correlativo interno de la base
de datos del software oficial, no un valor que viaje por este protocolo.

**Actualización (2026-07-02, misma sesión de pruebas):** una tercera
fichada trajo `verificationMethodCode = 00000030`, un valor nunca antes
observado en ninguna captura. El usuario confirmó contra el software
oficial que esa marcación fue **por tarjeta**. Esto confirma la fórmula de
la sección anterior para un segundo valor independiente:

| Código | Método | Confirmación |
|---|---|---|
| `0x10` | huella (fp) | hipótesis por fórmula, sin confirmar de forma independiente |
| `0x20` | clave (pwd) | nunca observado en ninguna captura — no se expone como hipótesis en el código |
| `0x30` | tarjeta (idcard) | ✅ **confirmado** contra el software oficial |
| `0x40` | rostro (face) | ✅ **confirmado** contra el software oficial |

Registro real (fixture `tests/contract/fixtures/tres-registros-pendientes-tarjeta.json`):
```
01 00 00 15 F9 71 C2 45 00 00 00 01 00 00 00 30 8D 09 00 00
```

### 5.7 Timestamp — segundos y minutos DECODIFICADOS ✅ (2026-07-02)

Usando `research/control_fichada.csv` (export real del software oficial con
hora exacta, con segundos, para 7 fichadas de prueba consecutivas) contra
los 7 registros descargados en la misma sesión, se aisló la fórmula para
dos de los tres componentes de hora que quedaban sin resolver.

**Correlación (las 7 filas, en orden):**

| CSV: hora | campo[0] (hex) | campo[1] (hex) |
|---|---|---|
| 14:34:**15** | 01 00 00 **0F** | F9 71 C2 **89** |
| 14:35:**54** | 01 00 00 **36** | F9 71 C2 **8D** |
| 14:36:**08** | 01 00 00 **08** | F9 71 C2 **91** |
| 14:38:**07** | 01 00 00 **07** | F9 71 C2 **99** |
| 14:39:**15** | 01 00 00 **0F** | F9 71 C2 **9D** |
| 14:41:**33** | 01 00 00 **21** | F9 71 C2 **A5** |
| 14:42:**58** | 01 00 00 **3A** | F9 71 C2 **A9** |

**Segundos — CONFIRMADO ✅:** el último byte de campo[0] es el segundo de la
hora, en binario simple (no BCD): `0x0F=15, 0x36=54, 0x08=8, 0x07=7, 0x21=33,
0x3A=58`. Coincide exacto en las 7 filas.

**Minutos — CONFIRMADO ✅:** el último byte de campo[1] es
`minuto * 4 + 1` (bits altos = minuto de 0-59, 2 bits bajos = flag fijo en
`01`): `34*4+1=137=0x89`, `35*4+1=141=0x8D`, `36*4+1=145=0x91`,
`38*4+1=153=0x99`, `39*4+1=157=0x9D`, `41*4+1=165=0xA5`, `42*4+1=169=0xA9`.
Coincide exacto en las 7 filas, y también en el dato de calibración previo
de la sección 5.6 (`13:56` → `56*4+1=225=0xE1`, y en efecto el registro de
esa fichada trae `F9 71 A2 E1`).

**Hora y fecha:** el 3er byte de campo[1] (byte10 del registro re-encuadrado)
en un principio parecía dar solo `hourMod8` (se repite cada 8 horas) más un
bit que se creyó un flag AM/PM — esa lectura quedó retractada: era en
realidad el día del mes, mezclado con la hora en el mismo byte. Ver §5.16
para el modelo completo y definitivo de fecha/hora, calibrado con fechas de
prueba reales.

---

### 5.8 campo[2] cambió de valor entre sesiones — hipótesis "legajo" refutada, nueva hipótesis "contador de lote" (2026-07-03)

Sesión real descargada el 2026-07-03 contra el mismo equipo de siempre
(`192.168.1.82`, también alcanzado vía IP pública `179.41.4.113` — mismos 28
registros por ambas rutas, sin diferencias byte a byte). Incluye fichadas de
varios legajos nuevos (no solo legajo 1), con horarios aproximados del
02/07 ~16:00 y del 03/07 ~07:00, según lo informado por el usuario (sin CSV
exacto de control para esta tanda, a diferencia de la sección 5.7).

**Hallazgo:** los 28 registros comparten el mismo valor de campo[2]:
`00 00 00 02` — un valor nunca antes observado (todas las capturas previas,
incluidas las de legajo 2 en la sección 5.6/5.7, traían `00 00 00 01`).

Esto es evidencia adicional (más allá de la refutación directa vía CSV,
sección 5.6) en contra de "campo[2] = legajo": si fuera legajo, con
"varios legajos nuevos" en el mismo lote se esperarían valores de campo[2]
distintos *dentro* del lote, no un único valor uniforme para las 28
fichadas. En cambio, el valor es constante *dentro* de cada sesión/lote de
descarga, pero cambió *entre* sesiones de días distintos (`01` el
2026-07-02, `02` el 2026-07-03).

**Hipótesis vigente (sin confirmar):** campo[2] podría ser un contador a
nivel de lote/sesión de descarga — por ejemplo, un índice de "generación" o
"día" que se incrementa una vez (no por fichada), posiblemente disparado
por el borrado (`0xA8`) probado el 2026-07-02 (sección 6.5) o por el cambio
de día calendario. No hay todavía suficientes puntos de datos (solo dos
valores consecutivos, `01` y `02`) para distinguir entre "contador de día",
"contador de lote/generación tras borrado" u otra causa. Hace falta
observar el valor en una tercera sesión (idealmente sin borrado de por
medio) para avanzar.

**Qué no cambió:** los primeros 3 bytes de campo[0] (`01 00 00`) y el primer
byte de campo[1] (`F9`) siguen constantes también en este lote de un día
distinto (2026-07-02/03), reforzando que esos bytes específicos no son un
componente de fecha simple día-a-día (sección 5.7, "Fecha (día/mes/año):
sin tocar" sigue vigente sin novedad).

---

### 5.9 Bloque horario confirmado para esta muestra ✅ y legajo/ID de empleado DECODIFICADO ✅ — CORRECCIÓN DE ENCUADRE, no desfasaje temporal (2026-07-03)

El usuario confirmó, contra la aplicación oficial, a qué bloque de 8 horas
corresponde cada mitad del lote de 28 fichadas de la sección 5.8:
registros 1-14 → bloque **16-23hs**, registros 15-28 → bloque **00-07hs**.
Con eso, el timestamp completo (hora exacta, minuto, segundo) de las 28
fichadas queda confirmado (detalle fila por fila en
`research/hipotesis_fichadas_2026-07-03.csv`).

**Importante — esta confirmación es puntual, no generaliza la fórmula:**
seguimos sin poder saber, para una fichada nueva y aislada, a cuál de los 3
bloques de 8 horas pertenece sin una referencia externa (el byte que se
especuló que podría marcar el bloque, primer byte de campo[1] = `F9`, sigue
constante en ambos bloques de esta muestra). Lo que se gana acá es la
certeza de estos 28 registros puntuales, útil como fixture de contrato, no
una fórmula genérica de bloque.

**Legajo/ID de empleado — CONFIRMADO ✅. Primer intento de explicación
(desfasaje temporal) DESCARTADO — la causa real es un error de encuadre
(framing) en el propio parser, no un comportamiento raro del reloj.**

Primer intento (incorrecto): se había planteado que el campo[4] byte0 de
un registro describía el legajo del registro *siguiente* ("desfasaje de un
registro"), atribuyéndolo a una posible demora del firmware en confirmar
la identificación. El usuario señaló, con razón, que esa explicación era
incoherente. Redirigiendo el análisis directamente a los bytes crudos del
`0xA4` (sección 5.2) en vez de a la CSV derivada, apareció la explicación
correcta:

**El "header de 4 bytes" que se lee y se descarta antes del primer
registro (sección 5.2, `src/protocol/client.js`) no es basura — es el
campo[4] (legajo) del primer registro.** El parser actual corta el stream
de bytes 4 posiciones tarde: agrupa `[header 4 bytes descartados]` +
`[registro1: campo0,1,2,3,4]` + `[registro2: campo0,1,2,3,4]` + ...,
cuando el corte correcto es `[registro1: header+campo0,1,2,3]` +
`[registro2: campo4(del anterior)+campo0,1,2,3]` + ... — es decir, **el
campo[4] de cada fichada real son los 4 bytes que preceden a su propio
campo[0]**, no los que lo siguen. Esto explica todo sin apelar a ningún
comportamiento temporal extraño:

- El "header" descartado en cada sesión SIEMPRE fue el legajo de la
  primera fichada, disponible en la misma respuesta, nunca datos de una
  sesión anterior perdida.
- El campo[4] del ÚLTIMO registro de cada respuesta queda "colgando"
  (no pertenece a ningún registro con campo0-3 disponible en esta
  respuesta). **Retractado en §5.14:** en su momento se creyó que era el
  legajo de una fichada aún no llegada; un contraejemplo con
  `declaredPendingCount=1` (donde no puede haber ningún pendiente más)
  refuta esa explicación — su significado real es desconocido.

**Verificación contra capturas reales independientes (no la CSV
derivada):**
- Sección 6.1 (registro único, "Cesar Villalba", capturado con tshark):
  header = `01 00 00 00` → byte0 = `1`. Legajo confirmado de Cesar
  Villalba = `1`. **Coincide.**
- Sección 6.2 (2 registros, mismo empleado, "el anterior sin borrar"):
  header = `01 00 00 00` → byte0 = `1`, igual que 6.1 (mismo empleado en
  ambos registros de esa captura). **Consistente.**
- Fixture `tests/contract/fixtures/siete-registros-control-fichada.json`
  (2026-07-02): aplicando el mismo re-encuadre, los legajos reales de
  `control_fichada.csv` coinciden con el campo[4] "adelantado" en las 6
  transiciones verificables (filas 2-7). El primer registro de esa sesión
  (legajo real `2`) necesitaría el header de esa captura puntual, que no
  quedó documentado aparte — coherente con el mismo patrón.
- Lote de 28 fichadas del 2026-07-03 (sección 5.8): con el re-encuadre,
  27 de 27 legajos verificables coinciden exactamente con la lista de
  legajos reales aportada por el usuario (`1, 2, 9, 10, 35, 53, 57, 59,
  71, 72, 73, 74, 76, 79`); el legajo de la fila 1 (`72`) es el que
  hubiera estado en el header de *esta* sesión (no capturado por
  separado porque `src/protocol/client.js` lo descarta sin loguearlo);
  el campo[4] de la fila 28 (`44`) queda colgando (ver §5.14 para la
  retractación de qué significa ese bloque).

**Conclusión:** el legajo/ID de empleado viaja en el primer byte de un
bloque de 4 bytes que el parser actual ubica en el lugar equivocado
(como "header" descartado antes del primer registro, y como "campo[4]"
al final de cada registro salvo el último). No hay ningún comportamiento
de "adelanto"/latencia del reloj: es nuestro propio código el que arma
mal los límites de cada registro. Esto también **refuta definitivamente**
la vieja hipótesis de que campo[2] fuera el legajo (sección 5.6/5.8:
campo[2] es `00000002` fijo para las 28, sin relación con la identidad de
nadie).

**Impacto en la implementación actual (bug real, no solo hallazgo de
investigación):** `src/protocol/client.js` descarta hoy el header de 4
bytes de cada sesión sin loguearlo ni exponerlo — eso significa que, tal
como está, el script **pierde silenciosamente el legajo de la primera
fichada de cada descarga**, en cada ejecución.

**Actualización (2026-07-03):** el re-encuadre ya se implementó —
`src/protocol/client.js` deja de descartar el header de 4 bytes y lo
antepone al buffer de registros antes de trocear; `src/protocol/records.js`
expone `legajoHipotesis` (primer byte del bloque re-encuadrado) y ajustó
los offsets de `timestampHypothesis`/`recordTypeConstant`/
`verificationMethodCode` a la posición correcta. Cubierto por tests nuevos
en `tests/contract/records.contract.test.js` y
`tests/integration/query-pending-fichadas.integration.test.js` contra las
capturas reales existentes (`un-registro-pendiente.json`,
`dos-registros-pendientes.json`, `siete-registros-control-fichada.json`).
Pendiente, no bloqueante: agregar el lote de 28 fichadas del 2026-07-03
como fixture de contrato nuevo (ver `research/hipotesis_fichadas_2026-07-03.csv`
como fuente).

---

### 5.11 Formato de salida legible: se saca el wrapper `{value, unconfirmed}`, y se corrige una sospecha errónea sobre el legajo por tarjeta (2026-07-03)

El usuario pidió un JSON de salida legible para `fecha`, `hora`, `legajo` y
`metodo`, sin que cada campo repita un flag `unconfirmed: true` — y
específicamente cuestionó por qué el legajo seguía marcado como hipótesis
si ya tenía tanta evidencia detrás.

**Corrección importante encontrada al revisar esto:** la sección 5.9 de
este documento (y `spec.md` Assumptions/FR-015) decían que "el único caso
de verificación por tarjeta capturado hasta ahora no coincidió con ningún
legajo real conocido" — refiriéndose al valor `44` de la fila 28 del lote
de 28 fichadas del 2026-07-03. Ese valor **nunca fue el legajo de la fila
28**: como ya quedó documentado en la sección 5.9 (corrección de
encuadre), `44` es el campo[4] **colgante** de esa fila, perteneciente a
una fichada todavía no descargada — el legajo real y correcto de la fila
28, una vez re-encuadrado, es `1` (tomado del campo[4] de la fila 27). La
sospecha sobre tarjeta quedó arrastrada de un análisis anterior a la
corrección de encuadre y nunca se volvió a verificar contra el dato ya
corregido.

**Verificación real:** el fixture de calibración de 7 registros
(`research/control_fichada.csv`, sección 5.7) incluye **dos fichadas
verificadas por tarjeta** (filas 3 y 6, `verificationMethodCode = 00000030`)
mezcladas con fichadas por huella y rostro. Las 7 filas, sin excepción,
decodifican su legajo real correctamente (`tests/contract/records.contract.test.js`,
"legajo encadenado coincide con los legajos reales..."). No hay ninguna
evidencia de que el legajo se codifique distinto según el método de
verificación.

**Cambio implementado:**
- `src/protocol/records.js`: `FichadaRecord` ahora expone `metodo`,
  `legajo`, `hora` y `fecha` como valores directos (sin wrapper). Un valor
  presente tiene evidencia real; `null` significa "no resuelto" o "se sabe
  que no es confiable para este caso" — ya no hace falta un flag aparte
  para eso.
- `legajo` se decodifica igual para los tres métodos de verificación (ya
  no hay caso especial para tarjeta).
- `metodo` es `null` si el código crudo no coincide con huella/tarjeta/
  rostro (antes se exponía como hipótesis con `value: null`).
- `fecha` se agrega como campo explícito, siempre `null` (nunca se
  decodificó ese campo del protocolo).
- `hora` sin cambios de comportamiento en este momento (ya devolvía `null`
  cuando no podía resolverse); solo se le sacó el wrapper. Ver §5.16 para
  el modelo completo y definitivo, que reemplaza los intentos posteriores
  de esta misma fecha (ya retractados).
- `contracts/output-schema.json`, `src/output/json-exporter.js`,
  `src/cli/consultar-fichadas.js` (el resumen de consola ahora avisa por
  campo específico: fecha/hora/legajo/método/anomalía, en vez de un
  mensaje genérico de "campos no confirmados") y los tests
  correspondientes se actualizaron.

---

### 5.14 CORRECCIÓN ❌: el bloque de 4 bytes que sobra al final de cada respuesta `0xA4` NO es "el legajo de una fichada aún no llegada" (2026-07-06)

§5.9 explicaba el bloque de 4 bytes sobrante al final de cada respuesta
`0xA4` (después de trocear `header + recordsBuffer` en bloques de
`RECORD_SIZE`) así: *"es simplemente el legajo de una fichada aún no
llegada a esta descarga (pendiente o futura)"*. Esa explicación no
sobrevive al caso de un solo registro pendiente.

**Contraejemplo, verificado directo contra
`tests/contract/fixtures/un-registro-pendiente.json` (research.md §6.1,
"Cesar Villalba"):** `0xB4` declaró `declaredPendingCountFromB4: 1`, y
`0xA4` entregó exactamente ese único registro completo (el legajo,
decodificado vía el `header`, coincide con el empleado real). No hay
ningún otro pendiente que explicar — la cuenta ya está saldada en 1 de 1
— y sin embargo sigue sobrando el mismo bloque de 4 bytes al final
(`99 02 00 00`). Lo mismo pasa en `dos-registros-pendientes.json`
(`declaredPendingCountFromB4: 2`, 2 registros entregados y decodificados
correctamente, y aun así sobra `DA 04 00 00` al final). Si la cuenta de
pendientes ya está completa, ese bloque no puede ser el legajo de "el
próximo pendiente que todavía no llegó" — sencillamente no hay next.

**Lo que sí sigue firme (no se toca):** el corrimiento en sí — anteponer
el `header` de 4 bytes leído antes de `recordsBuffer` y trocear desde el
offset 0 — es necesario para que los tres patrones ya confirmados
(`field0` empieza con `01 00 00`, `field1` empieza con `F9 71`,
`recordTypeConstant = 00000001`) cuadren en **todos** los registros de una
respuesta, no solo en el primero. El corrimiento describe correctamente
dónde empieza cada fichada; lo que estaba mal era solo la interpretación
del bloque final.

**Estado actual:** el bloque de cierre de 4 bytes se retracta a
"significado desconocido" — no se sabe si es un contador, un checksum, un
marcador de fin de mensaje, o algo distinto. Desde esta revisión,
`src/protocol/client.js` loguea su contenido crudo (no son datos
biométricos, solo framing de protocolo — Constitución Principio V lo
permite) para poder contrastarlo a futuro contra el primer legajo nuevo
que aparezca en la sesión siguiente, y así confirmar o descartar
definitivamente cualquier hipótesis sobre su significado. Hasta entonces,
se sigue descartando sin usarlo para decodificar ningún campo — este
cambio es solo de trazabilidad, no de comportamiento.

---

### 5.15 CORRECCIÓN ❌: `legajo` no es 1 byte — son los 4 bytes del campo, little-endian (2026-07-06)

Todas las fichadas reales vistas hasta ahora tenían legajo `<= 255`
(máximo observado: 79), y `legajoRaw` siempre traía sus 3 bytes altos en
`00 00 00`. Con eso, leer solo `buffer[0]` (el primer byte) daba el mismo
resultado que leer el campo completo — la implementación nunca se puso a
prueba con un legajo que necesitara más de 1 byte.

**Prueba real, con legajo de prueba `9999` a propósito (2026-07-06,
sesión `192.168.1.82-2026-07-06T13-39-02-649Z`):** la fichada trajo
`legajoRaw: "0F 27 00 00"`. `buffer[0]` da `0x0F = 15` — descarta el
resto del campo. Leyendo los 4 bytes como entero little-endian
(`0x0000270F`) da `9999`, exactamente el legajo de prueba usado. Esto
confirma dos cosas a la vez: el campo tiene más de 1 byte de ancho, y el
orden de los bytes es little-endian (el byte menos significativo va
primero — `0F` aporta las unidades/decenas bajas, `27` aporta los miles).

**Corrección aplicada:** `legajo` se decodifica ahora con
`buffer.readUInt32LE(0)` en vez de `buffer[0]` (`src/protocol/records.js`).
No cambia ningún resultado ya confirmado (todos los legajos reales previos
tenían bytes altos en cero, dan el mismo valor con cualquiera de los dos
métodos) — solo corrige el caso, antes no probado, de un legajo que
necesita más de 1 byte. Ver también
`tests/contract/fixtures/legajo-multibyte-9999.json`.

**Qué queda pendiente:** con un solo punto de calibración (`9999`) queda
confirmado que el campo es little-endian de al menos 2 bytes
significativos; no hay todavía un caso real con legajo `> 65535` que
distinga "2 bytes" de "4 bytes completos" — se usa `readUInt32LE` (los 4
bytes enteros) porque es el ancho real del campo en el registro, no
porque haya evidencia de un legajo que necesite el tercer o cuarto byte.

---

### 5.16 CORRECCIÓN COMPLETA ✅: `fecha` y `hora` quedan totalmente decodificados — el "flag AM/PM" y el "criterio de desempate" eran el día del mes, mal interpretado (2026-07-06)

Probando el reloj a propósito con la fecha cambiada (día, mes y año) e
haciendo una fichada en cada caso — `01/01/20`, `31/01/20`, `31/12/20` (día,
mes y año en formato DD/MM/YY), más una cuarta con el reloj en `31/12/20`
pero la hora llevada manualmente a `00:50`, y una segunda tanda de 8
fichadas más (días 1, 10, 15, 30, 31; años 2015, 2020, 2026; horas límite
0/12/23 — `research/calibracion_fecha_hora_bytes_7_a_11.csv`) — se aisló
el modelo completo y definitivo de los bytes 7-11 de cada registro:

```
byte7  (segundo):  binario directo, 0-59
byte8  (año):      bits 2-7 = (año - 1964); bits 0-1 = flag fijo "01"
byte9  (mes):      bits 4-7 = mes (1-12);   bits 0-3 = flag fijo "0001"
byte10 (día/hora): bits 5-7 = hourMod8;     bits 0-4 = día del mes (1-31, binario directo)
byte11 (min/bloque): bits 2-7 = minuto (0-59); bits 0-1 = bloque de hora (0=0-7hs, 1=8-15hs, 2=16-23hs)
hora = hourMod8 + 8×bloque
```

**Mes — `byte9`, nibble alto:** confirmado con 3 meses distintos (julio
real de 2026; enero y diciembre de prueba en 2020).

**Año — `byte8`, bits altos ÷ 4:** `año = (byte8 >> 2) + 1964`, confirmado
con 3 años distintos (2015, 2020, 2026).

**Día y hora — el hallazgo clave:** lo que research.md llamaba "flag
AM/PM" (bit0 de `byte10`) era en realidad el bit menos significativo del
**día del mes** — con día 1 (impar) y día 10 (par) al mismo mes/año/hora,
ese bit fue `1` y `0` respectivamente, coincidiendo con la paridad del día,
no con si la hora era `<=12`. Nunca se había notado porque toda la
calibración original venía de fichadas de un único día real (2 de julio),
así que ese bit nunca varió por otro motivo que no fuera la hora en ese
dataset particular — una correlación espuria de un dataset demasiado
angosto, no una propiedad real del protocolo. El modelo completo de
`byte10` es: bits 0-4 = día del mes (1-31), bits 5-7 = `hourMod8` —
confirmado exacto con día 1, 10, 15, 30 y 31.

Y lo que se llamaba "criterio de desempate al bloque 8-15hs" era
simplemente no leer un byte que ya traía la respuesta: los 2 bits bajos de
`byte11` ("minuteByte") son directamente el **bloque de 8 horas** (`0` =
0-7hs, `1` = 8-15hs, `2` = 16-23hs) — no hace falta adivinar ni desempatar
nada, `hora = hourMod8 + 8×bloque`. Confirmado con los 3 bloques usando los
casos límite: hora 0 (bloque 0), hora 12 (bloque 1), hora 23 (bloque 2) —
los tres decodifican exactos, incluido el caso de hora=0 que con el
criterio de empate viejo daba `8` en vez de `0`.

**Efecto retroactivo importante:** con el criterio de empate viejo,
`decodeHora` elegía **siempre** el bloque 8-15hs cuando había ambigüedad —
así que cualquier fichada real de los bloques 0-7hs o 16-23hs que lograra
pasar el gate de bits 1-4 (que en realidad exigía un día específico, ver
más abajo) quedaba con la hora **mal decodificada en 8 horas**, sin ningún
indicio de error (no daba `null`, daba un valor incorrecto con confianza).
El archivo de salida `fichadas-192.168.1.82-2026-07-06T12_24_17.891Z.json`
generado antes de esta corrección tenía registros del bloque 8-15hs
decodificados 8 horas tarde respecto de la hora real; cualquier JSON
exportado antes de esta corrección con horas del bloque 8-15hs debe
considerarse sospechoso.

**Por qué el gate viejo (`hourByte & 0b00011110 === 0b00010`) rechazaba
tantos registros reales, y por qué eso ocultó el bug de arriba:** ese gate
exigía que los bits 1-4 de `byte10` fueran exactamente `0001` — bajo el
modelo nuevo, bits 1-4 son parte del día (`día>>1`), así que el gate en
realidad exigía `piso(día/2) = 1`, es decir, **día 2 o 3 del mes**. Toda la
calibración original vino de fichadas de esos días exactos, por eso el
gate "funcionaba" — no validaba nada del protocolo, coincidía con el día
real de la única sesión de calibración disponible en ese momento.
Cualquier fichada de otro día quedaba en `null` (falso negativo, seguro
pero inútil) o, peor, si por casualidad los bits 1-4 daban `0001` por otro
día que también cumpliera `piso(día/2)=1`, decodificaba con el criterio de
empate viejo, que podía estar mal en 8 horas sin avisar.

**Código:** `decodeHora` se reemplaza por `decodeFechaHora`
(`src/protocol/records.js`), que decodifica año/mes/día/hora/minuto/segundo
juntos a partir de bytes 7-11, sin gates basados en el día ni criterios de
desempate — el único chequeo de plausibilidad que queda es que los flags
fijos de `byte8`/`byte9` (bits bajos) sigan siendo `01`/`0001`, y que
mes/día/minuto/segundo caigan en rango válido.

**Qué sigue sin resolver:** el significado real de los flags fijos de
`byte8` (bits 0-1), `byte9` (bits 0-3) y de los 3 bytes constantes de
`field0` (bytes 4-6, `01 00 00`) — se usan solo como chequeo de
plausibilidad, no se sabe qué codifican. Tampoco se probó un año fuera del
rango 2015-2026 en los extremos (por ejemplo, año 2000 o 2099, para
confirmar que la fórmula no tiene un techo/piso distinto fuera de ese
rango).

---

### 5.17 CORRECCIÓN ✅: el byte 2 del ACK es `ID DISPOSITIVO`, no una constante `01` — handshake fallaba con "ACK invalido" al cambiar ese parámetro (2026-07-08)

El usuario cambió a propósito el parámetro `ID DISPOSITIVO` del equipo (Menú
de configuración del reloj) de `1` (valor por defecto, usado en todas las
capturas previas de este documento) a `99`. Desde ese cambio, toda sesión
real fallaba de inmediato en el handshake con
`ACK invalido: bytes constantes 01 01 ausentes` (`parseAckHeader`,
`src/protocol/framing.js`).

**Diagnóstico, contra el equipo real en `192.168.1.66`
(`experiments/probar-handshake-raw.mjs`, dump crudo sin pasar por
`parseAckHeader`):**

```
Comando:   55 AA 01 80 00 00 00 00 00 00 FF FF 00 00 01 00
Respuesta: AA 55 63 01 00 00 00 00 01 00
```

`0x63` hex = `99` decimal — coincide exacto con el nuevo `ID DISPOSITIVO`.
El byte 3 (`01`) se mantiene constante, igual que en todas las capturas
previas con `ID DISPOSITIVO = 1`. Confirmado también en el ACK de `0xB4`
en la misma sesión:

```
Comando:   55 AA 01 B4 08 00 00 00 00 00 FF FF 00 00 02 00
Respuesta: AA 55 63 01 35 00 00 00 02 00   <- 35 hex = 53 pendientes
```

**Conclusión:** lo que §2.2 documentaba como "constante `01 01`" es en
realidad `[ID DISPOSITIVO][0x01 constante]`. Con `ID DISPOSITIVO = 1` (el
valor por defecto de fábrica, presente en todos los equipos vistos hasta
ahora) ambos bytes daban `01 01`, indistinguibles de una constante doble.

**Corrección aplicada:** `parseAckHeader` (`src/protocol/framing.js`) ya no
exige `buffer[2] === 0x01` — solo valida `buffer[3] === 0x01` (el byte que
sí es constante) y expone `buffer[2]` como campo `deviceId` en el resultado.
Verificado end-to-end contra el equipo real (`192.168.1.66`, `ID
DISPOSITIVO = 99`): el handshake y `0xB4` ya no fallan
(`experiments/probar-0xa4-raw.mjs`). Suite completa (59/59) sigue en verde
tras el cambio.

**Hallazgo nuevo, sin resolver — no relacionado con este bug:** en esa
misma sesión de prueba, `0xB4` declaró `declaredPendingCount = 53` (mucho
mayor que cualquier lote visto antes, máximo previo 28 en §5.8), y el
`0xA4` subsiguiente **no respondió nada** — el equipo cerró el socket sin
enviar payload, incluso con un timeout de 8-10s (contra los ~5s que
alcanzan sobradamente para lotes de hasta 28 registros). No hay evidencia
de que esto esté relacionado con `ID DISPOSITIVO`: el comando `0xA4` se
sigue enviando con byte 2 = `01` constante (no se probó todavía si el
equipo espera su propio `ID DISPOSITIVO` de vuelta en el comando, en vez
de la constante `01` histórica) y el handshake/`0xB4` de la misma sesión
respondieron con normalidad usando esa misma constante. Hipótesis
pendientes de probar, en orden de sospecha: (1) el equipo tiene un límite
de registros por respuesta `0xA4` menor a 53 y no lo comunica con un error
explícito, simplemente no responde; (2) el comando `0xA4` sí necesita el
`ID DISPOSITIVO` real en el byte 2 en vez de la constante `01` para
payloads grandes; (3) causa ajena al protocolo (memoria/timeout interno del
firmware con un lote inusualmente grande). Sin descartar aún ninguna.

---

### 5.18 Captura real software oficial ↔ equipo `ID DISPOSITIVO=99`, 53 pendientes — DOS diferencias nuevas con el protocolo documentado (2026-07-08)

`research/fichada_id_99.pcapng` (Wireshark, tráfico real entre "Gestión de
Personal Pro-Soft" y el equipo en `192.168.1.66`, ya con `ID DISPOSITIVO`
cambiado a `99`) contiene 4 streams TCP. Extraídos con
`tshark -r research/fichada_id_99.pcapng -q -z "follow,tcp,hex,N"` (N=0..3):

- **Stream 0 y 2:** solo `0x80` handshake, sin ninguna otra operación
  (probablemente un chequeo de conectividad del software antes de abrir la
  pantalla principal).
- **Stream 1:** handshake completo (`0x80` + `0x13`x3 + `0xC3`) sin
  `0xB4`/`0xA4` — consistente con una consulta de identificación del
  equipo, sin descarga de fichadas.
- **Stream 3:** handshake completo + `0xB4` (declara **53** pendientes) +
  **dos** llamadas a `0xA4` + `0x81` cierre. Este stream es el relevante
  para esta sección.

#### Diferencia 1 — el byte 2 de los COMANDOS también es `ID DISPOSITIVO`, no una constante

§2.1 documentaba el byte 2 de todo comando (`55 AA [01] [CMD] ...`) como
"constante `01` observada en todos los comandos". Falso, por el mismo
motivo que el byte 2 del ACK (§5.17): con `ID DISPOSITIVO=1` (todas las
capturas previas) era indistinguible de una constante. En este stream, el
software oficial envía **todos** sus comandos con byte 2 = `63` (99
decimal, el `ID DISPOSITIVO` real del equipo), no `01`:

```
55 63 80 ...   (handshake)
55 63 13 ...   (x3, params/identificacion)
55 63 c3 ...   (identificacion extendida)
55 63 b4 ...   (conteo pendientes)
55 63 a4 ...   (detalle, x2)
55 63 81 ...   (cierre)
```

(la tabla arriba omite el marcador `55 AA` inicial por brevedad; el byte
mostrado es el 3er byte de cada trama real, ej. `55 AA 63 80 ...`)

**Nota importante de compatibilidad:** el cliente propio de este proyecto
(`src/protocol/commands.js`) sigue enviando `01` fijo en el byte 2 de
todos los comandos, y **el equipo lo acepta igual** — se confirmó
end-to-end contra este mismo equipo (`ID DISPOSITIVO=99`) en §5.17 que el
handshake y `0xB4` funcionan con byte 2 = `01`. El equipo no parece exigir
que el byte 2 del comando coincida con su propio `ID DISPOSITIVO` — pero
el software oficial sí lo envía correctamente, así que **no puede
descartarse que algún firmware o alguna operación distinta a
handshake/0xB4 sí lo valide**. Recomendación: si se agrega soporte a
multi-equipo (varios `ID DISPOSITIVO` en la misma red), replicar el
comportamiento real del software oficial (usar el `deviceId` recién
confirmado por el handshake en los comandos siguientes de la misma
sesión) en vez de seguir confiando en que la constante `01` sea aceptada
para siempre.

#### Diferencia 2 — `0xA4` se pagina en llamadas sucesivas cuando hay muchos registros pendientes

Con 53 pendientes, el software oficial **no pide los 53 de una sola vez**.
Hace dos llamadas a `0xA4`:

**Llamada 1** — pide count=53 pero limita el tamaño de respuesta:
```
Comando:  55 AA 63 A4 00 00 00 00  35 00 00 00  00 04  06 00
                                    ^count=53LE32  ^byteLen=0x0400=1024  ^seq=6
Respuesta: ACK(10) + 55 AA + header(4, legajo=10) + recordsBuffer(1024 bytes)
```
1024 bytes de `recordsBuffer` = 51 registros completos (51×20=1020) + 4
bytes finales colgantes (el ya conocido "bloque de cierre" de §5.14) — es
decir, el equipo entrega **51 de los 53** pendientes en esta llamada,
limitando el tamaño de respuesta a 1024 bytes de `recordsBuffer` en vez de
honrar los `53×20=1060` bytes que "debería" pedir la fórmula documentada
en §5.2/commands.js (`count*RECORD_SIZE`). **1024 no es múltiplo de 20** —
es un tope de bytes por respuesta (probablemente un buffer fijo del
firmware), no un tope de cantidad de registros por sí solo. Con esta
única muestra no se puede confirmar si el tope real es "1024 bytes" o
"51 registros" (que coincide en dar 1024 = 51×20+4); haría falta un lote
de tamaño distinto (ej. 52 o 100 pendientes) para separar ambas hipótesis.

**Llamada 2** — trae el resto:
```
Comando:  55 AA 63 A4 00 00 00 00  00 00 01 00  24 00  07 00
                                    ^campo raro   ^byteLen=0x24=36  ^seq=7
Respuesta: ACK(10) + 55 AA + recordsBuffer(36 bytes, SIN header propio)
```
El campo en la posición de "count" (bytes 8-11) ya **no** es `53` ni
`2` (los pendientes restantes) — trae `00 00 01 00`. Sin poder separarlo
en dos sub-campos de 16 bits con certeza (`0000`/`0001`), la hipótesis más
plausible es que sea un indicador de página/continuación (`1` = "segunda
llamada"), **no** un contador de registros — el contador real de
registros restantes no viaje explícito en este campo en absoluto. Sin
confirmar; solo un punto de dato disponible.

**Verificación de que la concatenación es exacta (evidencia fuerte, no
solo hipótesis):** tomando los 4 bytes colgantes al final de la llamada 1
(`BA 91 00 00`) como el `header` (legajo) del primer registro de la
llamada 2, y concatenando `dangling(4) + recordsBuffer2(36) = 40 bytes`,
se decodifican **exactamente 2 registros completos** (40 = 2×20) más un
nuevo bloque colgante de 4 bytes al final (`70 06 00 00`, mismo patrón de
siempre). 51 (llamada 1) + 2 (llamada 2) = **53 — coincide exacto con el
`declaredPendingCount` de `0xB4`.** Esto confirma con evidencia directa
(no solo aritmética) que:

- El modelo de encuadre por encadenamiento de legajos (§5.9) sigue siendo
  correcto a través de una paginación completa.
- El "bloque de cierre" misterioso de 4 bytes (§5.14) es, al menos en el
  caso paginado, literalmente el `header` (legajo) de la página
  siguiente — no un dato sin sentido. Cuando no hay página siguiente
  (caso de una sola llamada, ya cubierto en §5.14), el equipo igual
  manda esos 4 bytes colgantes; su valor en ese caso puntual sigue sin
  explicación (podría ser el legajo de la próxima fichada que llegue *en
  el futuro*, aún sin confirmar).

**Fórmula hipotética para `byteLen` (bytes 12-13 del comando `0xA4`), sin
confirmar más allá de esta única calibración:**
- Primera llamada de una sesión: `byteLen = min(declaredCount, PAGE_SIZE) * RECORD_SIZE + 4`
  (el `+4` reserva espacio para el legajo colgante/próxima página). Con
  `PAGE_SIZE≈51` da `51*20+4=1024`, coincide exacto.
- Llamadas de continuación: `byteLen = remainingCount * RECORD_SIZE - 4`
  (no hace falta re-pedir el header: ya se tiene del colgante de la
  llamada anterior). Con `remainingCount=2` da `2*20-4=36`, coincide
  exacto.

**Impacto en la implementación actual (bug real, no solo hallazgo de
investigación) — RESUELTO ✅ (2026-07-08):** `src/protocol/client.js`/
`commands.js` pedían siempre `declaredPendingCount * RECORD_SIZE` en una
sola llamada a `0xA4` (`buildPendingDetailCommand`), sin paginar. Esto
coincidía con lo observado el 2026-07-08 contra este mismo equipo (`ID
DISPOSITIVO=99`, `declaredPendingCount=53`): al pedir los 53 de una sola
vez (`experiments/probar-0xa4-raw.mjs`), el equipo **no respondió nada y
cerró el socket** tras varios segundos.

**Paginación implementada** en `src/protocol/commands.js`
(`MAX_RECORDS_PER_PAGE=51`, `buildPendingDetailContinuationCommand`) y
`src/protocol/client.js` (`queryPendingFichadas` ahora pagina en un
`while` cuando `declaredPendingCount > MAX_RECORDS_PER_PAGE`). Validado en
tres niveles, todos contra este mismo equipo real (`192.168.1.66`, `ID
DISPOSITIVO=99`, `declaredPendingCount=53`):

1. **Experimento dirigido** (`experiments/probar-paginacion-0xa4.mjs`):
   probó y descartó dos hipótesis antes de dar con la correcta —
   (a) pedir `recordsBuffer` con `+4` extra en la 1ra página duplicaba 4
   bytes reales por error de encuadre propio (corrompía el último
   registro); (b) reenviar el mismo `count=declaredPendingCount` en la
   llamada de continuación hacía que el equipo **reiniciara la entrega
   desde el primer pendiente** (se repetían los primeros registros, no
   avanzaba el cursor). La hipótesis correcta — replicar el campo "count"
   de continuación observado en el software oficial como
   `pageIndex << 16` (§5.18 arriba) — dio 53/53 registros correctos, sin
   duplicados ni corrupción.
2. **Suite de contrato/integración** (`npm test`, 62/62 en verde):
   `tests/contract/fixtures/cincuenta-tres-pendientes-paginado.json`
   fixture con los bytes reales de esta misma sesión (52 registros de
   `research/fichada_id_99.pcapng` + normalización de `ID DISPOSITIVO` a
   `01` para consistencia con el resto de los fixtures), ejercida en
   `tests/integration/query-pending-fichadas.integration.test.js`.
   `tests/integration/performance.integration.test.js` (100 fichadas,
   SC-001) actualizado para paginar dinámicamente en vez de asumir una
   sola llamada `0xA4`.
3. **CLI de producción end-to-end** (`node src/cli/consultar-fichadas.js
   --host 192.168.1.66`): `declaredPendingCount=53` → 53 fichadas
   exportadas, página 1 (51 registros) + página 2 (2 registros) en ~30ms
   totales, sin timeouts ni cierres de socket (ver log de sesión).

**Qué sigue sin confirmar:** la fórmula `pageIndex << 16` para el campo de
continuación solo tiene un punto de calibración (`pageIndex=1`); no hay
datos para una 3ra página (`declaredPendingCount > 102`). Tampoco está
confirmado si `MAX_RECORDS_PER_PAGE=51` es el límite real del firmware o
solo un valor seguro por debajo del límite verdadero (§5.18 arriba,
sin resolver).

---

## 6. Ejemplos de capturas reales (hex)

### 6.1 Un registro pendiente (fichada única — Cesar Villalba)

```
Comando:   55 AA 01 B4 08 00 00 00 00 00 FF FF 00 00 05 00
Respuesta: AA 55 01 01 01 00 00 00 05 00        <- flag "01" = 1 registro pendiente

Comando:   55 AA 01 A4 00 00 00 00 01 00 00 00 14 00 06 00
Respuesta: AA 55 01 01 00 00 00 00 06 00 55 AA
           01 00 00 00                                    <- header
           01 00 00 16 F9 71 02 05 00 00 00 01
           00 00 00 10 99 02 00 00                        <- registro (20 bytes)
```

> **Corrección (2026-07-02):** el comando `0xA4` de este ejemplo se había
> transcripto con 15 bytes (faltaba un `00` en el campo de cantidad de
> registros, entre el byte `01` y el `00 00 14 00`). Se corrigió a 16 bytes
> tras extraer el tráfico con `tshark` directamente de
> `research/fichada3.pcapng` (stream 19, mismo caso de 1 registro pendiente)
> y de `research/fichada2.pcapng` (stream 11, 2 registros pendientes, ver
> 6.2). El formato real del comando `0xA4` es:
> ```
> 55 AA 01 A4 00 00 00 00 [cantidad de registros, LE32] [cantidad*20, LE16] [seq LE16]
> ```

### 6.2 Dos registros pendientes (rostro + huella, más el anterior sin borrar)

```
Comando:   55 AA 01 B4 08 00 00 00 00 00 FF FF 00 00 05 00
Respuesta: AA 55 01 01 02 00 00 00 05 00        <- flag "02" = 2 registros pendientes

Comando:   55 AA 01 A4 00 00 00 00 02 00 00 00 28 00 06 00
Respuesta: AA 55 01 01 00 00 00 00 06 00 55 AA
  header:     01 00 00 00
  registro 1: 01 00 00 16 F9 71 02 05 00 00 00 01 00 00 00 10 01 00 00 00
  registro 2: 01 00 00 09 F9 71 02 89 00 00 00 01 00 00 00 40 DA 04 00 00
```

> El comando `0xA4` y el ACK+marcador previos al header no estaban en la
> versión original de este ejemplo (solo se habían transcripto el header y
> los registros); se completaron el 2026-07-02 extrayéndolos con `tshark` de
> `research/fichada2.pcapng` (stream 11), que reproduce esta misma sesión de
> 2 registros pendientes byte a byte.

### 6.3 Comando de borrado

```
Comando:   55 AA 01 A8 00 00 00 00 00 00 FF FF 00 00 06 00
Respuesta: AA 55 01 01 00 00 00 00 06 00        <- ACK simple, sin payload
```

---

### 6.4 Apertura y cierre de sesión: `0x80`, `0x13` (x3) y `0x81` — confirmado ✅

Añadido el 2026-07-02, extraído con `tshark` de tres capturas independientes
(`research/fichada1.pcapng` stream 176, `research/fichada2.pcapng` streams
11 y 13, `research/fichada3.pcapng` stream 19), todas coincidentes byte a
byte salvo donde se indica. Resuelve el gap que impedía implementar
`buildHandshakeCommand`/`buildParamsCommand`/`buildCloseOperationCommand`
sin fabricar bytes (Constitución, Principio III).

**Secuencia real completa de una descarga de fichadas** (numeración de
secuencia desde 1 al conectar):

```
1. 0x80 (seq 1)               -> ACK
2. 0x13 "parametros"  (seq 2) -> ACK + 64 bytes
3. 0x13 "identificacion" (seq 3) -> ACK + 1040 bytes
4. 0x13 "parametros" de nuevo (seq 4) -> ACK + 64 bytes  (si, se repite)
5. 0xB4 (seq 5)                -> ACK con cantidad pendiente
6. 0xA4 (seq 6), solo si hay pendientes -> ACK + registros
7. 0x81 cierre (seq 6 o 7)     -> ACK
```

**0x80 — handshake:**
```
Comando:   55 AA 01 80 00 00 00 00 00 00 FF FF 00 00 01 00
Respuesta: AA 55 01 01 00 00 00 00 01 00
```
Los bytes 8-9 (aquí `00 00`) variaron entre capturas (`80 D2`, `4C D3`, `00 00`)
sin afectar el resultado — el equipo no parece validarlos.

**0x13 "parámetros" (64 bytes de respuesta, se envía 2 veces: 1ª y 3ª):**
```
Comando:   55 AA 01 13 00 00 00 00 00 00 00 00 30 00 [seq]
Respuesta: AA 55 01 01 00 00 00 00 [seq] 55 AA
           04 01 30 00 00 13 10 00 ED 04 00 00 01 01 00 01
           01 00 00 12 10 27 00 00 E8 03 00 00 E8 03 00 00
           E8 03 00 00 40 0D 03 00 01 01 00 01 00 00 00 04
           AD 05 00 00
```
Payload binario sin decodificar (parámetros de configuración del equipo),
idéntico byte a byte en las 4 sesiones revisadas.

**0x13 "identificación" (1040 bytes de respuesta, se envía 1 vez, 2ª):**
```
Comando:   55 AA 01 13 01 00 00 00 [4 bytes variables] 04 [seq]
Respuesta: AA 55 01 01 00 00 00 00 [seq] 55 AA + 1028 bytes
           (bloque de identificacion, ver seccion 4)
```
Los 4 "bytes variables" (posiciones 8-11) difieren por sesión (`08 CD`,
`D6 D1`, `00 00`) sin afectar el resultado, igual que en el handshake.

**0x81 — cierre de operación (variante byte4=`01`, usada al final de la sesión):**
```
Comando:   55 AA 01 81 01 00 00 00 00 00 FF FF 00 00 [seq]
Respuesta: AA 55 01 01 00 00 00 00 [seq]
```
Existe una variante byte4=`00` ("apertura de operación") usada antes de
comandos como `0xA8`, fuera del alcance de esta feature (FR-007).

### 6.5 Borrado (`0xA8`) — probado contra el equipo real (2026-07-02)

Fuera del CLI de esta feature (FR-007 lo excluye a propósito), pero probado
una vez de forma manual y explícitamente autorizada por el usuario, para
validar el comando contra el equipo real. Reproduce exactamente los bytes
observados en `research/fichada2.pcapng` stream 13, en una sesión TCP
**separada** de la lectura (no en la misma sesión que `0xB4`/`0xA4`):

```
1. 0x80 (seq 1) -> ACK
2. 0x13 "parametros" (seq 2) -> ACK + 64 bytes
3. 0x13 "identificacion" (seq 3) -> ACK + 1040 bytes
4. 0x13 "parametros" de nuevo (seq 4) -> ACK + 64 bytes
5. 0x81 apertura (seq 5): 55 AA 01 81 00 00 00 00 00 00 FF FF 00 00 05 00 -> ACK
6. 0xA8 borrar   (seq 6): 55 AA 01 A8 00 00 00 00 00 00 FF FF 00 00 06 00 -> ACK
7. 0x81 cierre   (seq 7): 55 AA 01 81 01 00 00 00 00 00 FF FF 00 00 07 00 -> ACK
```

**Resultado real:** antes del borrado, `0xB4` (en una tercera sesión TCP,
solo de verificación) declaraba 3 fichadas pendientes; después del `0xA8`,
la misma consulta `0xB4` declaró 0. Confirma que `0xA8` efectivamente limpia
el buffer de fichadas pendientes del equipo, sin devolver ningún payload de
datos (solo el ACK simple).

---

### 6.6 Experimento: ¿son necesarios los tres `0x13`? (2026-07-03)

Motivado por una inconsistencia entre `spec.md` FR-002 ("dos consultas
`0x13`") y la secuencia real implementada (tres: parámetros,
identificación, parámetros de nuevo), se corrieron dos experimentos
dirigidos contra el equipo real (`192.168.1.82`), con scripts ad-hoc en
`experiments/` (no forman parte del cliente de producción):

**Experimento A** (`experiments/probar-dos-0x13.mjs`): `0x80` → `0x13`
parámetros → `0x13` identificación → **(sin repetir parámetros)** → `0xB4`.
Corrido dos veces, con resultados **contradictorios**:

Intento 1:
```
[OK  ] 0x80 handshake
[OK  ] 0x13 parametros (1ra vez)
[FAIL] secuencia con 2 llamados 0x13 — Timeout esperando 1040 bytes (limite 3000ms)
[OK  ] 0x81 cierre
```

Intento 2 (mismo comando, misma máquina, corrido después):
```
[OK  ] 0x80 handshake
[OK  ] 0x13 parametros (1ra vez)
[OK  ] 0x13 identificacion
[OK  ] 0xB4 conteo de pendientes — declaredPendingCount=5
[OK  ] 0x81 cierre
```

**Experimento B** (`experiments/probar-solo-handshake.mjs`): `0x80` →
**(sin ningún `0x13`)** → `0xB4`.

```
[OK  ] 0x80 handshake
[OK  ] 0xB4 conteo de pendientes — declaredPendingCount=5
[OK  ] 0x81 cierre
```

El reloj respondió `0xB4` correctamente sin ningún `0x13` — sin errores,
sin timeout, con un conteo de pendientes coherente con la fichada de hora
12 documentada en la sección 5.10 (era la misma sesión con 5 fichadas
pendientes).

**Conclusión RETRACTADA:** la primera versión de esta sección afirmaba que
"lo que no funciona es una secuencia parcial (2 de 3)", basada en el
Intento 1 del Experimento A. El Intento 2, corrido después con la
**misma** secuencia exacta, funcionó de punta a punta sin problema. Dos
corridas idénticas con resultados opuestos es evidencia de que el fallo
del Intento 1 fue muy probablemente un **timeout circunstancial** (el
límite de 3000ms del script era ajustado para el tiempo real que tarda en
llegar la respuesta de identificación de 1040 bytes, posiblemente por
latencia de una conexión "fría"), **no** una señal de que el reloj
rechace o necesite una secuencia completa de tres `0x13`.

**Confirmación con 10 corridas adicionales (2026-07-03, `--timeout-ms 8000`):**
para descartar que el Intento 1 fuera un timeout ajustado en vez de una
falla real, se corrieron ambos experimentos 5 veces seguidas cada uno,
con un timeout casi 3 veces mayor (8000ms vs 3000ms):

- Experimento B (cero `0x13`): **5/5 exitosas**, mismo resultado
  (`declaredPendingCount=5`) en las cinco corridas.
- Experimento A (dos `0x13`, sin repetir parámetros): **5/5 exitosas**,
  mismo resultado (`declaredPendingCount=5`) en las cinco corridas.

10 de 10 corridas exitosas, con conteo estable entre corridas (evidencia
adicional de que ninguna de las dos variantes reducidas borra ni altera
las fichadas pendientes). Esto confirma que el Intento 1 (único fallo
observado en todo el experimento) fue un timeout circunstancial y no un
comportamiento real del reloj.

**Confirmación con `0xA4` real, sin ningún `0x13` (2026-07-03,
`experiments/probar-solo-handshake-con-a4.mjs`):** para cerrar el único
punto pendiente, se extendió el experimento para pedir el detalle
completo (`0xA4`), no solo el conteo (`0xB4`), reutilizando
`queryPendingFichadas()`/`parseFichadaRecord()` tal cual los usa
`src/protocol/client.js` en producción — mismo encuadre, mismo parser, sin
reimplementar nada. Corrido 3 veces seguidas:

```
[OK  ] 0x80 handshake
[OK  ] 0xB4 conteo de pendientes — declaredPendingCount=5
[OK  ] 0xA4 detalle — recibidos 5 registros (esperados 5)
[OK  ] 0x81 cierre

  #1: legajo=2 metodo=rostro hora=null recordTypeConstant=00000001
  #2: legajo=59 metodo=rostro hora=null recordTypeConstant=00000001
  #3: legajo=1 metodo=huella hora=null recordTypeConstant=00000001
  #4: legajo=41 metodo=rostro hora=null recordTypeConstant=00000001
  #5: legajo=1 metodo=huella hora=null recordTypeConstant=00000001
```

3/3 corridas exitosas, con los mismos 5 registros decodificados de forma
idéntica a como los decodifica el flujo de producción normal (mismos
legajos ya conocidos de sesiones anteriores con la secuencia completa de
tres `0x13`). El detalle completo (`0xA4`) funciona igual de bien sin
ningún `0x13`.

**Conclusión final:** con 13/13 corridas exitosas en total (5 + 5 + 3,
cubriendo `0xB4` solo, secuencia parcial, y `0xA4` real completo), la
evidencia es sólida: **los tres `0x13` no parecen ser necesarios para
ninguna de las operaciones que usa este script.** El software oficial
Pro-Soft los hace, pero el reloj no los exige para `0xB4`/`0xA4`.

**Decisión final (2026-07-03):** se simplificó `src/protocol/client.js`.
`runQuerySession` ahora acepta un parámetro `fullHandshake` (default
`false`): por defecto ejecuta solo el handshake `0x80` antes de `0xB4`/
`0xA4` (secuencia reducida, confirmada 13/13); si `fullHandshake: true`
(expuesto en el CLI como `--full-handshake`, ver `contracts/cli-contract.md`),
ejecuta la secuencia completa de tres `0x13` tal como la usa el software
oficial. Los builders `buildParamsCommand`/`buildIdentificationCommand`
NO se eliminaron — quedan disponibles y se siguen ejerciendo vía este
flag, para poder recuperar el comportamiento original sin tocar código si
un reloj distinto, un cambio de firmware, u otro parámetro del entorno
llegara a requerirlo. Ambos modos se confirmaron de punta a punta contra
el equipo real después de implementar el cambio (`node src/cli/consultar-fichadas.js
--host 192.168.1.82` y con `--full-handshake`, ambos exitosos).
`tests/integration/client-session.integration.test.js` cubre los dos
modos (servidor mock reducido y completo).

---

## 7. Recomendación práctica para integración

El timestamp de cada fichada (fecha y hora) y el legajo ya se decodifican
por completo desde el propio registro de 20 bytes (§5.15/§5.16), sin
depender del software oficial Pro-Soft ni de su hora actual. Recomendación
vigente:

1. **Usar `0xB4` + `0xA4` como fuente completa del evento** (legajo, método,
   fecha y hora), sin necesitar una fuente externa para el timestamp.
2. Si en algún momento aparece una fichada con `fecha`/`hora` en `null`
   (registro que no calza con los flags fijos esperados), tratarla como
   caso a investigar puntualmente, no como la norma — con los datos vistos
   hasta ahora eso solo ocurre con bytes corruptos o un formato de registro
   distinto al confirmado.
3. Considerar contactar a Pro-Soft solicitando formalmente documentación
   del protocolo o un SDK sigue siendo válido para otros campos aún sin
   resolver (campo[2]/`recordTypeConstant`, el bloque de cierre de 4 bytes
   de cada `0xA4`, ver §5.8/§5.14), pero ya no es necesario para fecha/hora
   ni legajo.

---

## 8. Próximos pasos sugeridos para completar la documentación

- [ ] Capturar una sesión de alta de usuario completa (comandos `0xE9`/`0x98`/`0x96`) con más detalle para documentar ese flujo también
- [ ] Confirmar el significado exacto de campo[3] (método de verificación) con pruebas dirigidas: una fichada solo por tarjeta, otra solo por PIN, etc.
- [ ] (§5.8) Descargar una tercera sesión en un tercer día calendario (sin borrado `0xA8` de por medio si es posible) para determinar si campo[2]/`recordTypeConstant` es un contador de día, un contador de lote/generación post-borrado, u otra cosa.
- [x] (§5.9, 2026-07-03) Corregir el encuadre en `src/protocol/client.js`/`records.js`: dejar de descartar el header de 4 bytes (es el legajo del primer registro) y re-cortar cada fichada como `[campo4 anterior] + [campo0,1,2,3 propios]`. Implementado y cubierto por tests.
- [ ] (§5.9) Agregar el lote de 28 fichadas del 2026-07-03 como fixture de contrato (`tests/contract/fixtures/`), ya con el encuadre corregido.
- [ ] (§5.9/§5.14) Confirmar con una tercera sesión (idealmente con más de un registro pendiente) que el re-encuadre de campo[4] es consistente y no depende del método de verificación ni de si hay borrado de por medio.
- [x] (§5.14, 2026-07-06) Loguear el contenido crudo del bloque de 4 bytes que sobra al final de cada respuesta `0xA4` (en vez de descartarlo en silencio), para poder investigar su significado real a futuro.
- [x] (§5.15, 2026-07-06) Corregir `legajo` a entero de 4 bytes little-endian (antes solo el primer byte) — confirmado con una fichada de prueba real con legajo 9999.
- [x] (§5.16, 2026-07-06) Decodificar `fecha` y `hora` por completo (año/mes/día/hora/minuto/segundo), sin ambigüedad ni criterio de desempate — calibrado probando el reloj con fechas de prueba a propósito (3 años, varios días/meses, y los 3 casos límite de bloque horario: 0, 12, 23).
- [ ] (§5.16) Probar un año fuera del rango 2015-2026 en los extremos (por ejemplo, año 2000 o 2099) para confirmar que la fórmula de año no tiene un techo/piso distinto fuera de ese rango.
- [ ] (§5.16) Confirmar el significado real de los flags fijos de `byte8` (bits 0-1) y `byte9` (bits 0-3), y de los 3 bytes constantes de campo[0] (bytes 4-6, `01 00 00`) — hoy solo se usan como chequeo de plausibilidad.
- [x] (§5.18, 2026-07-08) Implementar paginación de `0xA4` en `src/protocol/client.js`/`commands.js` para lotes grandes — implementado y validado en vivo contra el equipo real (53 pendientes, 2 páginas), ver detalle en §5.18.
- [ ] (§5.18) Determinar con un segundo lote de tamaño distinto (ej. 52 o 100 pendientes) si el límite real de `0xA4` es "1024 bytes de recordsBuffer" o "51 registros por llamada" (ambas hipótesis dan el mismo resultado con los únicos datos disponibles hoy).
- [ ] (§5.18) Confirmar si la fórmula `pageIndex << 16` para el campo "count" de continuación generaliza a una 3ra página o más — solo hay un punto de calibración (`pageIndex=1`, dos páginas totales); no hay una captura real con `declaredPendingCount > 102`.
