import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Helper compartido para tests: el `Select` de antd no es un <select> nativo
// (es un combobox que abre un dropdown en un portal), así que interactuar con
// él requiere abrir el combobox y clickear la opción, en vez de
// `fireEvent.change`. `comboboxName` es el nombre accesible del combobox
// (típicamente la label asociada); `textoOpcion` es el texto visible de la
// opción a elegir.
export async function seleccionarOpcion(comboboxName, textoOpcion) {
  const user = userEvent.setup();
  const combobox = screen.getByRole('combobox', { name: comboboxName });
  await user.click(combobox);
  // antd renderiza, además del dropdown visible, un listbox oculto (0x0, solo
  // para medida/accesibilidad) con el mismo texto — hay que esperar a que
  // exista y acotar la búsqueda al dropdown real (`.ant-select-dropdown`),
  // no a ese duplicado.
  await screen.findByRole('listbox');
  const opcion = await within(document.body).findByText(textoOpcion, {
    selector: '.ant-select-item-option-content',
  });
  await user.click(opcion);
}
