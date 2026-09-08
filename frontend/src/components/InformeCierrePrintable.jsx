import { Button } from 'antd';
import Dialogo from './Dialogo.jsx';
import { etiquetaPeriodo } from './SelectorPeriodo.jsx';
import InformeCierreContenido, { ESTILOS_INFORME } from './InformeCierreContenido.jsx';

// 018-informe-cierre-periodo — "Ver informe": muestra el contenido del informe
// de cierre dentro de un Dialogo modal para revisarlo en pantalla. La descarga
// a PDF vive en la página "Resumen del Período" (AccionInformeCierre), no acá.

export default function InformeCierrePrintable({ vista, onCerrar }) {
  return (
    <Dialogo
      etiqueta={`Informe de cierre — ${etiquetaPeriodo(vista.sello.periodoId)}`}
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
