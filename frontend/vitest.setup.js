import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Desmonta el árbol renderizado entre tests para aislarlos.
afterEach(() => {
  cleanup();
});
