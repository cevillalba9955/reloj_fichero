import { join } from 'node:path';
import { parsePeriodo } from './calendario-mes.js';

// Layout de almacenamiento por período (013-reestructurar-data-periodos,
// research.md §1). Único punto de verdad del nombre de carpeta y de los tres
// nombres de archivo fijos: ningún adaptador construye estas rutas a mano.
// Puro (sin I/O): solo compone strings; la creación perezosa de la carpeta es
// responsabilidad de quien escribe (contracts/storage-layout.md).

export const ARCHIVO_CALENDARIO = 'calendario.json';
export const ARCHIVO_FICHADAS = 'fichadas.json';
export const ARCHIVO_PADRON = 'padron.json';
// 018-informe-cierre-periodo — copia emitida de los informes de cierre del
// período (un objeto por tramo: 'Mes' / 'Q1' / 'Q2'). Estado operativo, no va
// a Oracle (Principio VI). Se escribe al cerrar el período y en cada re-emisión.
export const ARCHIVO_INFORME_CIERRE = 'informe-cierre.json';

// `<repoDir>/P<periodo>` — valida el período con el mismo criterio que el
// dominio de calendario (parsePeriodo: 'YYYYMM' de 6 dígitos, mes 1..12).
export function rutaCarpetaPeriodo(repoDir, periodo) {
  parsePeriodo(periodo);
  return join(repoDir, `P${periodo}`);
}
