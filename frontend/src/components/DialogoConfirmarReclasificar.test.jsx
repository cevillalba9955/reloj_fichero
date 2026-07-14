import { render, screen, fireEvent } from '@testing-library/react';
import DialogoConfirmarReclasificar from './DialogoConfirmarReclasificar.jsx';

// T030 (parte componente, feature 007) — el diálogo confirma o cancela sin
// efectos colaterales propios. FR-016. (El "no dispara POST al cancelar" a nivel
// de flujo se verifica en App.test.jsx.)

const dia = { fecha: '2026-07-06', dd: 6 };

test('cancelar invoca onCancelar y no onConfirmar', () => {
  const onConfirmar = vi.fn();
  const onCancelar = vi.fn();
  render(
    <DialogoConfirmarReclasificar
      dia={dia}
      clasificacion="Feriado"
      onConfirmar={onConfirmar}
      onCancelar={onCancelar}
    />,
  );
  fireEvent.click(screen.getByText('Cancelar'));
  expect(onCancelar).toHaveBeenCalledTimes(1);
  expect(onConfirmar).not.toHaveBeenCalled();
});

test('confirmar invoca onConfirmar', () => {
  const onConfirmar = vi.fn();
  const onCancelar = vi.fn();
  render(
    <DialogoConfirmarReclasificar
      dia={dia}
      clasificacion="Feriado"
      onConfirmar={onConfirmar}
      onCancelar={onCancelar}
    />,
  );
  fireEvent.click(screen.getByText('Confirmar'));
  expect(onConfirmar).toHaveBeenCalledTimes(1);
  expect(onCancelar).not.toHaveBeenCalled();
});

test('sin día no renderiza diálogo', () => {
  render(<DialogoConfirmarReclasificar dia={null} clasificacion="Feriado" />);
  expect(screen.queryByRole('dialog')).toBeNull();
});
