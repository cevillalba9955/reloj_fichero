// feature 016 — `rol-apex.js` lee `window.location.search` una sola vez al
// importarse (mismo momento en que se carga la SPA dentro del iframe de
// APEX), así que cada test controla la URL ANTES de importar el módulo
// (con `vi.resetModules()` + `history.pushState`) para simular una carga
// distinta de la página.

beforeEach(() => {
  vi.resetModules();
  history.pushState(null, '', '/');
});

test('sin "?rol=" en la URL, fetchConRol se comporta igual que fetch (sin header agregado)', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  vi.stubGlobal('fetch', fetchMock);

  const { fetchConRol } = await import('./rol-apex.js');
  await fetchConRol('/api/acl/mi-rol');

  expect(fetchMock).toHaveBeenCalledWith('/api/acl/mi-rol', {});
  vi.unstubAllGlobals();
});

test('con "?rol=" en la URL, agrega el header X-Apex-Rol en cada llamada', async () => {
  history.pushState(null, '', '/?rol=RRHH_ADMIN');
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  vi.stubGlobal('fetch', fetchMock);

  const { fetchConRol, HEADER_ROL } = await import('./rol-apex.js');
  await fetchConRol('/api/acl/mi-rol');

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [, opciones] = fetchMock.mock.calls[0];
  expect(opciones.headers.get(HEADER_ROL)).toBe('RRHH_ADMIN');
  vi.unstubAllGlobals();
});

test('preserva otros headers/opciones ya presentes en el init', async () => {
  history.pushState(null, '', '/?rol=RRHH_EDITOR');
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  vi.stubGlobal('fetch', fetchMock);

  const { fetchConRol, HEADER_ROL } = await import('./rol-apex.js');
  await fetchConRol('/api/vacaciones/asignaciones', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });

  const [, opciones] = fetchMock.mock.calls[0];
  expect(opciones.method).toBe('POST');
  expect(opciones.body).toBe('{}');
  expect(opciones.headers.get('Content-Type')).toBe('application/json');
  expect(opciones.headers.get(HEADER_ROL)).toBe('RRHH_EDITOR');
  vi.unstubAllGlobals();
});

test('un "?rol=" vacío se trata como ausente (sin header agregado)', async () => {
  history.pushState(null, '', '/?rol=');
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  vi.stubGlobal('fetch', fetchMock);

  const { fetchConRol } = await import('./rol-apex.js');
  await fetchConRol('/api/acl/mi-rol');

  expect(fetchMock).toHaveBeenCalledWith('/api/acl/mi-rol', {});
  vi.unstubAllGlobals();
});
