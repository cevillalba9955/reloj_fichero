import { Table, Tag, Button, Space, Empty } from 'antd';
import { ESTADOS_FICHADA } from '../theme/estados.js';

// feature 010 (US1) — Tabla de fichadas del día: una fila por empleado esperado
// con legajo, nombre, entrada, salida, horas trabajadas y situación. La
// distinción visual de la situación va por `Tag` (color + ícono) + texto
// legible (mismo criterio de accesibilidad que Leyenda.jsx: el significado
// nunca depende solo del color). Componente de presentación puro: no llama a
// la API (Principio I).

const CLAVE_SITUACION = {
  ESPERANDO: 'esperando',
  PRESENTE: 'presente',
  TARDE: 'tarde',
  AUSENTE: 'ausente',
  Completa: 'completa',
  RETIRO_ANTICIPADO: 'retiro-anticipado',
  'Feriado cumplido': 'feriado-cumplido',
  'No aplica': 'no-aplica',
  ANOMALIA: 'anomalia',
};

const ETIQUETA_SITUACION = {
  RETIRO_ANTICIPADO: 'Retiro anticipado',
  ANOMALIA: 'Anomalía',
};

// feature 012 — un día con Justificación `Paga` vigente se etiqueta como
// "LICENCIA" en la columna Situación (en vez de AUSENTE/etc.), para que se
// note de un vistazo que la ausencia está cubierta y paga.
function esLicencia(fila) {
  return fila.justificacion?.tipoPago === 'Paga';
}

// Minutos → 'H:MM' para lectura (el dato viaja en minutos, formato de 004).
function formatoHoras(min) {
  const m = Number.isInteger(min) && min >= 0 ? min : 0;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

// iteración 2 (FR-001, research.md §7) — Pausa "principal" del día: la primera
// pausa intermedia ordenada por `desde` (regla de presentación; los retiros
// anticipados tienen su propia situación y no se muestran en estas columnas).
// `adicionales` cuenta las pausas intermedias restantes (indicador +N).
function pausaPrincipalDe(pausas = []) {
  const intermedias = pausas
    .filter((p) => (p.tipo ?? 'intermedia') === 'intermedia')
    .sort((a, b) => a.desde.localeCompare(b.desde));
  if (intermedias.length === 0) return { principal: null, adicionales: 0 };
  return { principal: intermedias[0], adicionales: intermedias.length - 1 };
}

export default function TablaFichadasHoy({
  empleados,
  onCorregir = null,
  onPausaRetiro = null,
  onJustificar = null,
  onRevertirJustificacion = null,
}) {
  if (!empleados || empleados.length === 0) {
    return <Empty description="No hay empleados esperados para hoy." />;
  }
  const conAcciones = Boolean(onCorregir || onPausaRetiro || onJustificar || onRevertirJustificacion);

  const columnas = [
    { title: 'Leg', dataIndex: 'legajo', key: 'legajo' },
    { title: 'Empleado', key: 'nombre', render: (_, fila) => fila.nombre ?? '—' },
    { title: 'Entrada', key: 'entrada', render: (_, fila) => fila.entrada ?? '—' },
    {
      title: 'Pausa',
      children: [
        {
          title: '',
          key: 'pausaDesde',
          render: (_, fila) => pausaPrincipalDe(fila.pausas).principal?.desde ?? '—',
        },
        {
          title: '',
          key: 'pausaHasta',
          render: (_, fila) => {
            const { principal, adicionales } = pausaPrincipalDe(fila.pausas);
            return (
              <>
                {principal?.hasta ?? '—'}
                {adicionales > 0 && <span className="pausas-adicionales"> +{adicionales}</span>}
              </>
            );
          },
        },
      ],
    },
    { title: 'Salida', key: 'salida', render: (_, fila) => fila.salida ?? '—' },
    {
      title: 'Horas',
      key: 'horas',
      render: (_, fila) => formatoHoras(fila.horasTrabajadas),
    },
    {
      title: 'Situación',
      key: 'situacion',
      render: (_, fila) => {
        const licencia = esLicencia(fila);
        const clave = licencia ? 'licencia' : CLAVE_SITUACION[fila.situacion] ?? 'desconocida';
        const etiquetaSituacion = licencia ? 'LICENCIA' : ETIQUETA_SITUACION[fila.situacion] ?? fila.situacion;
        const { color, icon: Icon } = ESTADOS_FICHADA[clave] ?? ESTADOS_FICHADA.desconocida;
        return (
          <>
            <Tag color={color} icon={<Icon />}>
              {etiquetaSituacion}
            </Tag>
            {fila.justificacion && <span> {fila.justificacion.etiquetaMotivo}</span>}
            {fila.correccionVigente && <span className="marca-correccion"> (*)</span>}
            {fila.requiereJustificacionRevision && (
              <span className="marca-revision" role="alert">
                {' '}
                ⚠ revisar: llegaron fichadas sobre un día justificado
              </span>
            )}
            {fila.anomalias?.length > 0 && (
              <span className="anomalias"> {fila.anomalias.join('; ')}</span>
            )}
          </>
        );
      },
    },
  ];

  if (conAcciones) {
    columnas.push({
      title: 'Acciones',
      key: 'acciones',
      render: (_, fila) => (
        <Space size="small">
          {onCorregir && fila.situacion !== 'ANOMALIA' && !fila.justificacion && (
            <Button size="small" onClick={() => onCorregir(fila)}>
              Corregir
            </Button>
          )}
          {onPausaRetiro && fila.situacion !== 'ANOMALIA' && fila.entrada != null && (
            <Button size="small" onClick={() => onPausaRetiro(fila)}>
              Excepcion
            </Button>
          )}
          {onJustificar && fila.situacion === 'AUSENTE' && !fila.justificacion && (
            <Button size="small" onClick={() => onJustificar(fila)}>
              Justificación
            </Button>
          )}
          {onRevertirJustificacion && fila.justificacion && (
            <Button size="small" onClick={() => onRevertirJustificacion(fila)}>
              Revertir justificación
            </Button>
          )}
        </Space>
      ),
    });
  }

  return (
    <Table
      aria-label="Fichadas de hoy"
      className="tabla-fichadas"
      size="small"
      bordered
      pagination={false}
      rowKey="legajo"
      columns={columnas}
      dataSource={empleados}
      rowClassName={(fila) => {
        const licencia = esLicencia(fila);
        const clave = licencia ? 'licencia' : CLAVE_SITUACION[fila.situacion] ?? 'desconocida';
        return `fila-fichada situacion-${clave}`;
      }}
    />
  );
}
