import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Desmonta el árbol renderizado entre tests para aislarlos.
afterEach(() => {
  cleanup();
});

// jsdom no implementa getComputedStyle(elt, pseudoElt); antd Modal/Drawer lo
// usan para medir el ancho de la scrollbar al bloquear el scroll del body.
// Sin este stub, cada test con Modal imprime un error inofensivo por consola.
const getComputedStyleOriginal = window.getComputedStyle;
window.getComputedStyle = (elt, pseudoElt) =>
  pseudoElt ? getComputedStyleOriginal(elt) : getComputedStyleOriginal(elt, pseudoElt);

// jsdom no implementa ResizeObserver; antd Input.TextArea/Table lo usan para
// medir contenedores (útil solo en un navegador real).
window.ResizeObserver =
  window.ResizeObserver ||
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

// jsdom tampoco implementa window.matchMedia; antd Table/Grid lo usan para
// los breakpoints responsivos (útil solo en un navegador real).
window.matchMedia =
  window.matchMedia ||
  function matchMediaStub(query) {
    return {
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false;
      },
    };
  };
