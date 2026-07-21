import {
  ClockCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  CloseCircleOutlined,
  MinusCircleOutlined,
  FileProtectOutlined,
  WarningOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';

// Mapa único color+ícono por clave de situación/estado de dominio, reutilizado
// por TablaFichadasHoy, Leyenda y CeldaDia. Regla de accesibilidad heredada
// (comentario "FR-004" en el código anterior): ningún estado depende solo del
// color — el `Tag`/`Badge` que consuma este mapa SIEMPRE debe mostrar además
// el texto de la situación como children, nunca solo el color.
export const ESTADOS_FICHADA = {
  esperando: { color: 'default', icon: ClockCircleOutlined },
  presente: { color: 'success', icon: ClockCircleOutlined },
  completa: { color: 'success', icon: CheckCircleOutlined },
  tarde: { color: 'warning', icon: ExclamationCircleOutlined },
  ausente: { color: 'error', icon: CloseCircleOutlined },
  'retiro-anticipado': { color: 'warning', icon: ExclamationCircleOutlined },
  'feriado-cumplido': { color: 'default', icon: CheckCircleOutlined },
  'no-aplica': { color: 'default', icon: MinusCircleOutlined },
  anomalia: { color: 'error', icon: WarningOutlined },
  licencia: { color: 'blue', icon: FileProtectOutlined },
  desconocida: { color: 'default', icon: QuestionCircleOutlined },
};

// Claves de clasificación/resaltado del calendario (feature 007), mismo mapa
// color+ícono para Leyenda/CeldaDia.
export const ESTADOS_CALENDARIO = {
  habil: { color: 'blue', icon: CheckCircleOutlined },
  feriado: { color: 'gold', icon: ExclamationCircleOutlined },
  'no-laborable': { color: 'default', icon: MinusCircleOutlined },
};
