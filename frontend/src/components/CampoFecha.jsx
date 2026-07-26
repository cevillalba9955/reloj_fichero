import { DatePicker } from 'antd';
import dayjs from 'dayjs';

// Input de fecha compartido por todos los formularios (spec 015 feedback):
// mismo formato de presentación dd/mm/aaaa en toda la app, sin depender del
// locale del navegador (a diferencia de <input type="date">). El resto de
// cada formulario sigue trabajando con el string "YYYY-MM-DD" que espera la
// API: este componente solo traduce en la frontera de presentación.
const FORMATO = 'DD/MM/YYYY';
const FORMATO_ISO = 'YYYY-MM-DD';

export default function CampoFecha({ value, onChange, ...props }) {
  return (
    <DatePicker
      format={FORMATO}
      value={value ? dayjs(value, FORMATO_ISO) : null}
      onChange={(fecha) => onChange(fecha ? fecha.format(FORMATO_ISO) : '')}
      {...props}
    />
  );
}
