import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EmployeesScreen } from '../src/features/employees/components/EmployeesScreen';
import { employeesApi } from '../src/features/employees/services/employees-api';

vi.mock('../src/features/employees/services/employees-api', () => ({
  employeesApi: { list: vi.fn(), invite: vi.fn(), update: vi.fn(), cancel: vi.fn() },
}));

const employees = [
  { id: 'active-1', userId: 'user-1', name: 'Ana', email: 'ana@test.dev', role: 'CASHIER', status: 'ACTIVE', locationIds: ['loc-1'], version: 1, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'disabled-1', userId: 'user-2', name: 'Beto', email: 'beto@test.dev', role: 'MANAGER', status: 'DISABLED', locationIds: ['loc-1'], version: 2, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'invited-1', userId: 'user-3', name: 'Ceci', email: 'ceci@test.dev', role: 'CASHIER', status: 'INVITED', locationIds: ['loc-1'], version: 3, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
] as const;

describe('EmployeesScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(employeesApi.list).mockResolvedValue([...employees] as never);
    vi.mocked(employeesApi.update).mockResolvedValue(employees[1] as never);
    vi.mocked(employeesApi.cancel).mockResolvedValue(undefined as never);
  });

  it('muestra estados en español y acciones según el estado', async () => {
    render(<EmployeesScreen locationId="loc-1" />);
    await screen.findByText('Ana');
    expect(screen.getByText('Activo')).toBeDefined();
    expect(screen.getByText('Deshabilitado')).toBeDefined();
    expect(screen.getByText('Invitado')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Eliminar a Ana' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Reactivar a Beto' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Eliminar definitivamente a Beto' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Cancelar invitación de Ceci' })).toBeDefined();
  });

  it('pide confirmación al eliminar y permite reactivar', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<EmployeesScreen locationId="loc-1" />);
    await screen.findByText('Ana');

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar a Ana' }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(employeesApi.update).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Reactivar a Beto' }));
    await waitFor(() => expect(employeesApi.update).toHaveBeenCalledWith('disabled-1', {
      role: 'MANAGER', status: 'ACTIVE', locationIds: ['loc-1'], version: 2,
    }));
    confirmSpy.mockRestore();
  });

  it('confirma la eliminación definitiva de un empleado deshabilitado', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<EmployeesScreen locationId="loc-1" />);
    await screen.findByText('Beto');

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar definitivamente a Beto' }));
    expect(confirmSpy).toHaveBeenCalledWith('¿Eliminar definitivamente a Beto? Esta acción revoca su acceso.');
    expect(employeesApi.cancel).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar definitivamente a Beto' }));
    await waitFor(() => expect(employeesApi.cancel).toHaveBeenCalledWith('disabled-1', { version: 2 }));
    confirmSpy.mockRestore();
  });
});
