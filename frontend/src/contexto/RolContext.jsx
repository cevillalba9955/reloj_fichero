import { createContext, useContext, useEffect, useState } from 'react';
import { crearClienteAcl } from '../api/acl-client.js';

// feature 016 — Contexto de React que expone el rol resuelto para el
// usuario actual (Lector/Editor/Configurador) y `puede(rolMinimo)`, para que
// AppShell y los formularios de escritura no repitan la llamada a
// `GET /api/acl/mi-rol` ni la lógica de rango (Principio I: estado
// compartido centralizado, no prop drilling).

const RANGO = { lector: 0, editor: 1, configurador: 2 };

export const RolContext = createContext(null);

export function useRol() {
  const contexto = useContext(RolContext);
  if (!contexto) throw new Error('useRol() debe usarse dentro de <RolProvider>');
  return contexto;
}

const clienteAclPorDefecto = crearClienteAcl();

// Mientras el rol no se resolvió todavía (`rol === null`, fetch en curso),
// `puede()` devuelve `false` para cualquier nivel: no se habilita nada de
// escritura hasta confirmar el rol real (mismo criterio conservador que el
// rechazo del servidor si el rol no se puede determinar, FR-004). Si el
// fetch falla (red caída), cae a `lector` — igual que un rol sin mapear.
export function RolProvider({ cliente = clienteAclPorDefecto, children }) {
  const [rol, setRol] = useState(null);

  useEffect(() => {
    let cancelado = false;
    cliente
      .obtenerMiRol()
      .then(({ rol: rolResuelto }) => {
        if (!cancelado) setRol(rolResuelto);
      })
      .catch(() => {
        if (!cancelado) setRol('lector');
      });
    return () => {
      cancelado = true;
    };
  }, [cliente]);

  function puede(rolMinimo) {
    if (rol == null) return false;
    return RANGO[rol] >= RANGO[rolMinimo];
  }

  return <RolContext.Provider value={{ rol, puede }}>{children}</RolContext.Provider>;
}
