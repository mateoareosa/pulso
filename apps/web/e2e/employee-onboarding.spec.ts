import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  const response = await request.post('http://localhost:4100/api/test/reset', {
    headers: { Origin: 'http://localhost:4173' },
  });
  expect(response.ok()).toBeTruthy();
});

async function inviteEmployee(page: Page, role: 'CASHIER' | 'MANAGER', email: string) {
  const owner = await page.request.post('/api/auth/register', {
    data: {
      businessName: 'Kiosco Empleados',
      locationName: 'Casa Central',
      ownerName: 'Propietaria',
      email: `owner-${role.toLowerCase()}@example.com`,
      password: 'OwnerPassword123!',
    },
  });
  expect(owner.status()).toBe(201);
  const ownerSession = (await owner.json()) as { location: { id: string } };

  const invitation = await page.request.post('/api/employees/invitations', {
    data: {
      email,
      name: role === 'MANAGER' ? 'Encargada Turno' : 'Cajero Mostrador',
      role,
      locationIds: [ownerSession.location.id],
    },
  });
  expect(invitation.status()).toBe(201);
  const payload = (await invitation.json()) as { action: { url: string } };
  const invitationUrl = new URL(payload.action.url);

  await page.goto(`/accept-invitation${invitationUrl.hash}`);
}

for (const employee of [
  {
    role: 'CASHIER' as const,
    email: 'cashier@example.com',
    expectedRole: 'Cajero',
    visible: ['MOSTRADOR', 'CAJA', 'HISTORIAL'],
    hidden: ['EMPLEADOS', 'PRODUCTOS', 'COMPRAS'],
  },
  {
    role: 'MANAGER' as const,
    email: 'manager@example.com',
    expectedRole: 'Encargado',
    visible: ['MOSTRADOR', 'CAJA', 'HISTORIAL', 'PRODUCTOS', 'COMPRAS'],
    hidden: ['EMPLEADOS'],
  },
]) {
  test(`${employee.role} accepts an invitation, logs in, and sees only permitted views`, async ({
    page,
  }) => {
    await inviteEmployee(page, employee.role, employee.email);

    await expect(page.getByRole('heading', { name: 'Bienvenido al equipo' })).toBeVisible();
    await expect(page.getByText(employee.email)).toBeVisible();
    await page.getByLabel('Nueva contraseña').fill('EmployeePassword123!');
    await page.getByLabel('Confirmar contraseña').fill('EmployeePassword123!');
    await page.getByRole('button', { name: 'Establecer contraseña' }).click();

    await expect(page.locator('#login-email')).toBeVisible();
    await page.locator('#login-email').fill(employee.email);
    await page.locator('#login-password').fill('EmployeePassword123!');
    await page.getByRole('button', { name: 'INGRESAR AL MOSTRADOR' }).click();

    await expect(page.locator('.pulso-ribbon')).toContainText(employee.expectedRole);
    for (const label of employee.visible) {
      await expect(page.getByRole('tab', { name: label, exact: true })).toBeVisible();
    }
    for (const label of employee.hidden) {
      await expect(page.getByRole('tab', { name: label, exact: true })).toHaveCount(0);
    }
  });
}
