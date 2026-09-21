import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ActionScreen } from '../src/features/auth/ActionScreen';
import { apiClient } from '../src/services/api-client';

const token = 'a'.repeat(43);

describe('ActionScreen invitation acceptance', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(apiClient, 'previewAction').mockResolvedValue({
      type: 'INVITE',
      tenantName: 'Kiosco El Trébol',
      email: 'cajero@kiosco.com',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    vi.spyOn(apiClient, 'acceptInvitation').mockResolvedValue();
    vi.spyOn(apiClient, 'logout').mockResolvedValue();
  });

  it('enforces the shared 12-character password contract before calling the API', async () => {
    render(<ActionScreen token={token} onDone={vi.fn()} />);
    await screen.findByText('cajero@kiosco.com');

    fireEvent.change(screen.getByLabelText('Nueva contraseña'), {
      target: { value: 'short-pass' },
    });
    fireEvent.change(screen.getByLabelText('Confirmar contraseña'), {
      target: { value: 'short-pass' },
    });
    fireEvent.submit(
      screen.getByRole('button', { name: 'Establecer contraseña' }).closest('form')!
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('al menos 12 caracteres');
    expect(apiClient.acceptInvitation).not.toHaveBeenCalled();
  });

  it('accepts the invitation, clears any previous session, and returns to login', async () => {
    const onDone = vi.fn();
    render(<ActionScreen token={token} onDone={onDone} />);
    await screen.findByText('cajero@kiosco.com');

    fireEvent.change(screen.getByLabelText('Nueva contraseña'), {
      target: { value: 'EmployeePassword123!' },
    });
    fireEvent.change(screen.getByLabelText('Confirmar contraseña'), {
      target: { value: 'EmployeePassword123!' },
    });
    fireEvent.submit(
      screen.getByRole('button', { name: 'Establecer contraseña' }).closest('form')!
    );

    await waitFor(() =>
      expect(apiClient.acceptInvitation).toHaveBeenCalledWith(token, 'EmployeePassword123!')
    );
    expect(apiClient.logout).toHaveBeenCalledOnce();
    expect(vi.mocked(apiClient.logout).mock.invocationCallOrder[0]!).toBeLessThan(
      vi.mocked(apiClient.acceptInvitation).mock.invocationCallOrder[0]!
    );
    expect(onDone).toHaveBeenCalledOnce();
  });
});
