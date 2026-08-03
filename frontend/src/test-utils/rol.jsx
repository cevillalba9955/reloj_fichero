import { render } from '@testing-library/react';
import { RolContext } from '../contexto/RolContext.jsx';

// feature 016 — Helper compartido para tests de componentes que dependen de
// `useRol()`: provee el rol directamente vía el contexto (sin pasar por un
// fetch simulado ni por `RolProvider`), para no introducir un microtask
// pendiente antes de que el componente bajo prueba pueda usarse — mismo
// espíritu que test-utils/antd.js.
const RANGO = { lector: 0, editor: 1, configurador: 2 };

export function renderConRol(rol, ui, opciones) {
  const puede = (rolMinimo) => RANGO[rol] >= RANGO[rolMinimo];
  return render(<RolContext.Provider value={{ rol, puede }}>{ui}</RolContext.Provider>, opciones);
}
