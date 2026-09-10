import { Button } from 'antd';
import Dialogo from './Dialogo.jsx';
import { etiquetaPeriodo } from './SelectorPeriodo.jsx';
import InformeCierreContenido, { ESTILOS_INFORME } from './InformeCierreContenido.jsx';

// 018-informe-cierre-periodo — "Ver informe": muestra el contenido del informe
// de cierre dentro de un Dialogo modal para revisarlo en pantalla. La descarga
// a PDF vive en la página "Resumen del Período" (AccionInformeCierre), no acá.

export default function InformeCierrePrintable({ vista, onCerrar }) {
  // 022-informe-primera-quincena-anticipado — distingue en el título del modal
  // la emisión anticipada de la primera quincena (mes todavía no cerrado).
  const etiqueta =
    `Informe de cierre — ${etiquetaPeriodo(vista.sello.periodoId)}` +
    (vista.sello.anticipado ? ' · emisión anticipada' : '');
  return (
    <Dialogo
      etiqueta={etiqueta}
      onCerrar={onCerrar}
      ancho="min(1100px, 94vw)"
    >
      <style>{ESTILOS_INFORME}</style>
      <div className="informe-cierre-imprimible">
        <InformeCierreContenido vista={vista} />
        <div className="acciones no-imprimir">
          <Button onClick={onCerrar}>Cerrar</Button>
        </div>
      </div>
    </Dialogo>
  );
}
