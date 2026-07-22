import { Tabs } from 'antd';
import { crearClienteConfiguracion } from '../api/configuracion-client.js';
import FormularioConexionReloj from './FormularioConexionReloj.jsx';
import TablaMotivosAusencia from './TablaMotivosAusencia.jsx';
import FormularioCategoriasModalidades from './FormularioCategoriasModalidades.jsx';

// feature 014 — Página "Configuración": tres secciones independientes (una
// por historia de usuario), cada una con su propio guardado — un error de
// validación en una pestaña no bloquea ni afecta a las otras (P1 > P2 > P3 >
// P4, cada una usable por separado). El único acceso a datos es el cliente
// `/api` (Principio I).

const clientePorDefecto = crearClienteConfiguracion();

export default function PaginaConfiguracion({ cliente = clientePorDefecto }) {
  const items = [
    {
      key: 'reloj',
      label: 'Reloj y servicio',
      children: <FormularioConexionReloj cliente={cliente} />,
    },
    {
      key: 'motivos',
      label: 'Motivos de ausencia',
      children: <TablaMotivosAusencia cliente={cliente} />,
    },
    {
      key: 'categorias',
      label: 'Categorías y modalidades',
      children: <FormularioCategoriasModalidades cliente={cliente} />,
    },
  ];

  return (
    <section className="configuracion">
      <Tabs items={items} defaultActiveKey="reloj" />
    </section>
  );
}
