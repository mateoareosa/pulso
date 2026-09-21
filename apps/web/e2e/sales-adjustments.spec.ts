import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  const response = await request.post('http://localhost:4100/api/test/reset', {
    headers: { Origin: 'http://localhost:4173' },
  });
  expect(response.ok()).toBeTruthy();
});

async function seedSale(page: Page, tender: 'CASH' | 'DEBIT') {
  const registration = await page.request.post('/api/auth/register', {
    data: {
      businessName: `Kiosco Ajustes ${tender}`,
      locationName: 'Casa Central',
      ownerName: 'Propietaria',
      email: `ajustes-${tender.toLowerCase()}@example.com`,
      password: 'OwnerPassword123!',
    },
  });
  expect(registration.status()).toBe(201);

  const category = await page.request.post('/api/categories', { data: { name: 'Golosinas' } });
  expect(category.status()).toBe(201);
  const categoryBody = (await category.json()) as { id: string };
  const product = await page.request.post('/api/products', {
    data: {
      name: 'Alfajor de prueba',
      categoryId: categoryBody.id,
      barcode: `779-${tender}`,
      sku: `AJ-${tender}`,
      salePriceCents: 150000,
      costPriceCents: 90000,
      initialStock: '10',
      minimumStock: '1',
    },
  });
  expect(product.status()).toBe(201);
  const productBody = (await product.json()) as { id: string };

  const shift = await page.request.post('/api/cash/shifts/open', {
    data: { openingAmountCents: 500000, idempotencyKey: crypto.randomUUID() },
  });
  expect(shift.status()).toBe(200);

  const sale = await page.request.post('/api/sales', {
    data: {
      idempotencyKey: crypto.randomUUID(),
      items: [
        {
          productId: productBody.id,
          name: 'Alfajor de prueba',
          barcode: `779-${tender}`,
          quantity: 2,
          unitPriceCents: 150000,
          totalPriceCents: 300000,
        },
      ],
      tenders: [{ type: tender, amountCents: 300000 }],
      totalCents: 300000,
      createdAtUtc: new Date().toISOString(),
    },
  });
  expect(sale.ok()).toBeTruthy();
  if (tender === 'DEBIT') {
    const close = await page.request.post('/api/cash/shifts/close', {
      data: { countedAmountCents: 500000, idempotencyKey: crypto.randomUUID() },
    });
    expect(close.status()).toBe(200);
  }
  return (await sale.json()) as { sale: { id: string } };
}

async function openSaleDetail(page: Page) {
  await page.goto('/');
  await page.getByRole('tab', { name: 'HISTORIAL', exact: true }).click();
  await page.getByRole('button', { name: /detalle/i }).click();
  await expect(page.getByRole('region', { name: /comprobante de venta/i })).toBeVisible();
}

test('return: an owner submits a partial cash return and sees the audit timeline', async ({
  page,
}) => {
  await seedSale(page, 'CASH');
  await openSaleDetail(page);

  await page.getByRole('button', { name: /devolver artículos/i }).click();
  await page.getByRole('spinbutton', { name: /cantidad a devolver/i }).fill('1');
  await page.getByRole('textbox', { name: /motivo del ajuste/i }).fill('Producto dañado');
  await page
    .getByRole('dialog', { name: /devolver artículos/i })
    .getByRole('button', { name: /confirmar devolución/i })
    .click();

  const audit = page.getByRole('region', { name: /historial de ajustes/i });
  await expect(audit).toContainText('DEVOLUCIÓN');
  await expect(audit).toContainText('Producto dañado');
  await expect(audit).toContainText('Reintegro completado');
});

test('void: a non-cash void remains pending for manual settlement without an open shift', async ({
  page,
}) => {
  await seedSale(page, 'DEBIT');
  await openSaleDetail(page);

  await page.getByRole('button', { name: /anular venta/i }).click();
  await page.getByRole('textbox', { name: /motivo del ajuste/i }).fill('Venta duplicada');
  await page
    .getByRole('dialog', { name: /anular venta/i })
    .getByRole('button', { name: /^anular venta$/i })
    .click();

  const audit = page.getByRole('region', { name: /historial de ajustes/i });
  await expect(audit).toContainText('ANULACIÓN');
  await expect(audit).toContainText('Débito');
  await expect(audit).toContainText('Pendiente manual');
});
