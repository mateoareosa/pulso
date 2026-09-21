import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function registerBusiness(page: Page, email: string, owner = 'Dueño Importación') {
  await page.goto('/');
  const register = page.locator('#register-businessName');
  const button = page.locator('button:has-text("Registrar mi negocio")');
  await expect(register.or(button)).toBeVisible();
  if (await button.isVisible()) await button.click();
  await register.fill('Kiosco Importación');
  await page.locator('#register-locationName').fill('Central');
  await page.locator('#register-ownerName').fill(owner);
  await page.locator('#register-email').fill(email);
  await page.locator('#register-password').fill('passwordSegura123!');
  await page.locator('#register-passwordConfirm').fill('passwordSegura123!');
  await page.locator('button:has-text("REGISTRAR NEGOCIO Y ABRIR MOSTRADOR")').click();
  await expect(page.locator('.pulso-ribbon')).toBeVisible();
  await page.locator('button:has-text("PRODUCTOS")').click();
  await expect(page.locator('h1:has-text("Productos e Inventario")')).toBeVisible();
}

const validCsv = `name,category,barcode,sku,salePriceCents,costPriceCents,unit,initialStock,minimumStock,quickSlot,isAvailable\nCafé importado,Bebidas,779000000901,IMP-901,4500,2800,unidad,10,2,,true\n`;
const invalidCsv = `name,category,barcode,sku,salePriceCents,costPriceCents,unit,initialStock,minimumStock,quickSlot,isAvailable\nFila inválida,Bebidas,779000000902,IMP-902,-1,2800,unidad,10,2,,true\n`;

async function openImport(page: Page) {
  await page.locator('button:has-text("Importar productos")').click();
  const dialog = page.locator('[role="dialog"][aria-labelledby="product-import-title"]');
  await expect(dialog).toBeVisible();
  return dialog;
}

test.beforeEach(async ({ page }) => {
  const reset = await page.request.post('http://localhost:4100/api/test/reset', { headers: { Origin: 'http://localhost:4173' } });
  expect(reset.status()).toBe(200);
});

test.describe('Bulk product import E2E', () => {
  test('opens visual modal and runs an accessible preview', async ({ page }) => {
    await registerBusiness(page, 'import-modal@pulso.dev');
    const dialog = await openImport(page);
    await expect(dialog).toContainText('Subí un CSV o Excel');
    const scan = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
    expect(scan.violations).toEqual([]);
  });

  test('preview with errors blocks commit', async ({ page }) => {
    await registerBusiness(page, 'import-invalid@pulso.dev');
    const dialog = await openImport(page);
    await dialog.locator('input[type="file"]').setInputFiles({ name: 'invalid.csv', mimeType: 'text/csv', buffer: Buffer.from(invalidCsv) });
    await expect(dialog.locator('[role="alert"]')).toContainText('Corregí estas filas');
    await expect(dialog.locator('button:has-text("Confirmar importación")')).toBeDisabled();
    await expect(dialog.locator('input[type="checkbox"]')).toHaveCount(0);
  });

  test('valid preview commits and refreshes the catalog', async ({ page }) => {
    await registerBusiness(page, 'import-valid@pulso.dev');
    const dialog = await openImport(page);
    await dialog.locator('input[type="file"]').setInputFiles({ name: 'valid.csv', mimeType: 'text/csv', buffer: Buffer.from(validCsv) });
    await expect(dialog).toContainText('1 válidas');
    await dialog.locator('input[type="checkbox"]').check();
    await dialog.locator('button:has-text("Confirmar importación")').click();
    await expect(dialog).toContainText('Importación completa: 1 productos incorporados');
    await expect(page.locator('table')).toContainText('Café importado');
  });

  test('CASHIER cannot access product administration or bulk import', async ({ page }) => {
    await registerBusiness(page, 'import-cashier@pulso.dev', 'Cajero Importación');
    const role = await page.request.post('http://localhost:4100/api/test/set-role', { headers: { Origin: 'http://localhost:4173' }, data: { email: 'import-cashier@pulso.dev', role: 'CASHIER' } });
    expect(role.status()).toBe(200);
    await page.reload();
    await expect(page.locator('button:has-text("PRODUCTOS")')).not.toBeVisible();
    const preview = await page.request.post('/api/products/import/preview', { multipart: { file: { name: 'valid.csv', mimeType: 'text/csv', buffer: Buffer.from(validCsv) } } });
    expect(preview.status()).toBe(403);
  });
});
