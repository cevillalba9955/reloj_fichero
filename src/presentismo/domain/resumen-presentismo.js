import { Clasificacion } from './calendario-mes.js';
import { EstadoJornada } from './jornada.js';

// Dominio: agrega las jornadas de un período de liquidación en un
// ResumenPresentismo (data-model.md, FR-019/020/022). Función pura.

// jornadas: [{ dia:{clasificacion, fecha}, resultado:<salida de aplicar ajustes>,
//              fichadasFueraDeCalendario?:string[] }]
export function construirResumen({ legajo, periodo, tramo, modalidadTipo, params, jornadas }) {
  let horasEsperadas = 0;
  let horasTrabajadas = 0;
  let horasCorregidas = 0;
  let descuentoPausas = 0;
  const conteos = { laborables: 0, completas: 0, incompletas: 0, sinFichadas: 0 };
  const fichadasFueraDeCalendario = [];

  for (const { dia, resultado } of jornadas) {
    const clas = dia.clasificacion;

    // Horas esperadas: Laborable y Feriado aportan jornada esperada; No Laborable no.
    if (clas === Clasificacion.LABORABLE || clas === Clasificacion.FERIADO) {
      horasEsperadas += params.jornadaEsperada;
    }
    if (clas === Clasificacion.LABORABLE) conteos.laborables += 1;

    switch (resultado.estado) {
      case EstadoJornada.COMPLETA:
        conteos.completas += 1;
        break;
      case EstadoJornada.INCOMPLETA:
        conteos.incompletas += 1;
        break;
      case EstadoJornada.SIN_FICHADAS:
        conteos.sinFichadas += 1;
        break;
      default:
        break;
    }

    horasTrabajadas += resultado.totalDiario ?? 0;
    if (resultado.correccionVigente) horasCorregidas += resultado.totalDiario ?? 0;
    descuentoPausas += resultado.descuentoPausas ?? 0;

    // Fichadas en días que no aportan (No Laborable / Feriado): se reportan aparte.
    if (clas === Clasificacion.NO_LABORABLE || clas === Clasificacion.FERIADO) {
      const ids = resultado.fichadasNoUsadas ?? [];
      if (ids.length > 0) {
        fichadasFueraDeCalendario.push({ fecha: dia.fecha, clasificacion: clas, fichadas: ids });
      }
    }
  }

  return {
    legajo,
    periodo,
    tramo,
    modalidad: modalidadTipo,
    params: {
      aperturaOficial: params.aperturaOficial,
      cierreOficial: params.cierreOficial,
      margenApertura: params.margenApertura,
      margenCierre: params.margenCierre,
    },
    horasEsperadas,
    horasTrabajadas,
    horasAuto: horasTrabajadas - horasCorregidas,
    horasCorregidas,
    descuentoPausas,
    saldo: horasTrabajadas - horasEsperadas,
    conteos,
    fichadasFueraDeCalendario,
    anomalias: [],
  };
}
