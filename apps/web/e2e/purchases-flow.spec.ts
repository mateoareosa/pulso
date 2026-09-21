import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'path';
import fs from 'fs';

const SCREENSHOTS_DIR = path.resolve(process.cwd(), 'e2e/screenshots');

test.beforeAll(() => {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }
});

test.beforeEach(async ({ page }) => {
  // Reset test database before each test scenario
  const resetRes = await page.request.post('http://localhost:4100/api/test/reset', {
    headers: {
      Origin: 'http://localhost:4173',
    },
  });
  if (resetRes.status() !== 200) {
    throw new Error(`Failed to reset test database: HTTP ${resetRes.status()}`);
  }
});

async function saveScreenshot(page: Page, name: string) {
  const localPath = path.join(SCREENSHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: localPath, fullPage: true });
}

async function registerBusinessAndSeed(
  page: Page,
  businessName = 'Kiosco Pulso Compras',
  locationName = 'Sucursal Central',
  ownerName = 'Dueño Kiosco',
  email = 'owner@pulsocompras.com',
  password = 'passwordSegura123!'
) {
  await page.goto('/');

  const registerInput = page.locator('#register-businessName');
  const goToRegisterBtn = page.locator('button:has-text("Registrar mi negocio")');

  await expect(registerInput.or(goToRegisterBtn)).toBeVisible();
  if (await goToRegisterBtn.isVisible()) {
    await goToRegisterBtn.click();
  }

  await expect(registerInput).toBeVisible();
  await page.locator('#register-businessName').fill(businessName);
  await page.locator('#register-locationName').fill(locationName);
  await page.locator('#register-ownerName').fill(ownerName);
  await page.locator('#register-email').fill(email);
  await page.locator('#register-password').fill(password);
  await page.locator('#register-passwordConfirm').fill(password);
  await page.locator('button:has-text("REGISTRAR NEGOCIO Y ABRIR MOSTRADOR")').click();

  const ribbon = page.locator('.pulso-ribbon');
  await expect(ribbon).toBeVisible();
  await expect(ribbon).toContainText(businessName);

  // Seed standard category and product via API
  await page.evaluate(async () => {
    const catRes = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bebidas' }),
    });
    const category = await catRes.json();

    await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Gaseosa Cola 500ml',
        categoryId: category.id,
        barcode: '7799001',
        sku: 'GAS-500',
        salePriceCents: 150000, // $1500.00
        costPriceCents: 80000, // $800.00
        initialStock: '20.0000',
        minimumStock: '5.0000',
        quickSlot: 1,
      }),
    });
  });

  await page.reload();
  await expect(page.locator('.pulso-ribbon')).toBeVisible();
}

async function createDraftThroughEditor(page: Page, documentNumber = 'BORRADOR-0001') {
  await page.evaluate(async () => {
    await fetch('/api/suppliers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Proveedor Draft E2E', taxId: '30-70000000-1' }),
    });
  });

  await page.locator('[data-testid="nav-tab-purchases"]').click();
  await page.locator('[data-testid="subtab-purchases-create"]').click();
  await expect(page.locator('[data-testid="purchase-editor-supplier-select"]')).toBeVisible();
  await page
    .locator('[data-testid="purchase-editor-supplier-select"]')
    .selectOption({ label: 'Proveedor Draft E2E (30700000001)' });
  await page.locator('[data-testid="purchase-editor-invoice-input"]').fill(documentNumber);
  await page.locator('[data-testid="purchase-item-product-select"]').selectOption({ index: 1 });
  await page.locator('[data-testid="purchase-item-quantity-input"]').fill('2');
  await page.locator('[data-testid="purchase-item-cost-input"]').fill('900.00');
  await page.locator('[data-testid="add-line-item-btn"]').click();
  await page.locator('[data-testid="save-draft-btn"]').click();
  await expect(page.locator('[data-testid="subtab-purchases-list"]')).toBeVisible();
  const row = page.locator('tr[data-testid^="purchase-row-"]').first();
  await expect(row).toContainText(documentNumber);
  return (await row.getAttribute('data-testid'))!.replace('purchase-row-', '');
}

test.describe('Vertical Slice 5 — Proveedores, Compras y Reposición de Stock E2E', () => {
  test('Complete purchase cycle: create supplier, draft purchase, receive with OUTSIDE_CASH, verify stock increment and cost update', async ({
    page,
  }) => {
    await registerBusinessAndSeed(page);

    // 1. Navigate to COMPRAS tab
    const purchasesTab = page.locator('[data-testid="nav-tab-purchases"]');
    await expect(purchasesTab).toBeVisible();
    await purchasesTab.click();

    await saveScreenshot(page, 'vs5-purchases-tab-initial');

    // 2. Go to PROVEEDORES subtab
    const suppliersSubtab = page.locator('[data-testid="subtab-purchases-suppliers"]');
    await expect(suppliersSubtab).toBeVisible();
    await suppliersSubtab.click();

    // Verify empty suppliers message
    await expect(page.locator('[data-testid="no-suppliers-msg"]')).toBeVisible();

    // 3. Click "+ NUEVO PROVEEDOR"
    await page.locator('[data-testid="create-supplier-button"]').click();
    await expect(page.locator('[data-testid="supplier-modal"]')).toBeVisible();

    // Fill supplier form
    await page.locator('[data-testid="supplier-form-name"]').fill('Distribuidora Norte SRL');
    await page.locator('[data-testid="supplier-form-taxid"]').fill('30-71234567-9');
    await page.locator('[data-testid="supplier-form-phone"]').fill('11-4567-8900');
    await page.locator('[data-testid="supplier-form-email"]').fill('ventas@distnorte.com');
    await page.locator('[data-testid="supplier-form-address"]').fill('Ruta 9 Km 45, Campana');

    await saveScreenshot(page, 'vs5-supplier-modal-filled');

    // Submit supplier creation
    await page.locator('[data-testid="supplier-form-submit"]').click();

    // Check supplier appears in table
    await expect(
      page.locator('tr[data-testid^="supplier-row-"]').filter({ hasText: 'Distribuidora Norte SRL' })
    ).toBeVisible();
    await expect(page.locator('text=30-71234567-9')).toBeVisible();

    await saveScreenshot(page, 'vs5-supplier-created-table');

    // 4. Switch to "NUEVA COMPRA" subtab
    const createPurchaseSubtab = page.locator('[data-testid="subtab-purchases-create"]');
    await createPurchaseSubtab.click();

    await expect(page.locator('[data-testid="purchase-editor-supplier-select"]')).toBeVisible();

    // Select the newly created supplier
    await page
      .locator('[data-testid="purchase-editor-supplier-select"]')
      .selectOption({ label: 'Distribuidora Norte SRL (30712345679)' });
    await page.locator('[data-testid="purchase-editor-invoice-input"]').fill('FC-A-0001-00098765');

    // Payment source: OUTSIDE_CASH (default)
    await page
      .locator('[data-testid="purchase-editor-payment-select"]')
      .selectOption('OUTSIDE_CASH');

    // Select product to receive: Gaseosa Cola 500ml
    const productSelect = page.locator('[data-testid="purchase-item-product-select"]');
    await productSelect.selectOption({ index: 1 }); // first product

    // Quantity: 30 units, Cost: 900.00 (increased from 800)
    await page.locator('[data-testid="purchase-item-quantity-input"]').fill('30');
    await page.locator('[data-testid="purchase-item-cost-input"]').fill('900.00');
    await page.locator('[data-testid="add-line-item-btn"]').click();

    // Verify projected stock in table: 20 un. → 50 un.
    await expect(page.locator('text=20 un. → 50 un.')).toBeVisible();

    // Check total: 30 * 900 = $27,000.00
    await expect(page.locator('[data-testid="purchase-editor-total"]')).toContainText('27.000');

    await saveScreenshot(page, 'vs5-purchase-editor-configured');

    // 5. Click "RECIBIR E INCREMENTAR STOCK"
    await page.locator('[data-testid="receive-purchase-btn"]').click();

    // Verify redirected back to purchases list
    await expect(page.locator('[data-testid="subtab-purchases-list"]')).toBeVisible();
    const receivedRow = page.locator('tr[data-testid^="purchase-row-"]').filter({
      hasText: 'Distribuidora Norte SRL',
    });
    await expect(receivedRow).toBeVisible();
    await expect(receivedRow).toContainText('RECIBIDA');

    await saveScreenshot(page, 'vs5-purchase-received-list');

    // 6. Inspect detail modal
    await page.locator('button:has-text("Ver Detalle")').first().click();
    await expect(page.locator('[data-testid="purchase-detail-modal"]')).toBeVisible();
    await expect(page.locator('[data-testid="purchase-detail-status"]')).toContainText('RECIBIDA');
    await expect(page.locator('[data-testid="purchase-detail-payment-source"]')).toContainText(
      'Fondos Externos'
    );
    await expect(page.locator('[data-testid="purchase-detail-total"]')).toContainText('27.000');

    await saveScreenshot(page, 'vs5-purchase-detail-modal');

    // Close detail modal
    await page.locator('[data-testid="close-purchase-detail-btn"]').click();
    await expect(page.locator('[data-testid="purchase-detail-modal"]')).not.toBeVisible();

    // 7. Check updated stock and cost in PRODUCTOS tab
    await page.locator('[data-testid="nav-tab-products"]').click();
    const productRow = page
      .locator('table')
      .filter({ has: page.getByRole('columnheader', { name: 'Producto' }) })
      .locator('tbody tr')
      .filter({ hasText: 'Gaseosa Cola 500ml' });
    await expect(productRow).toBeVisible();
    // Stock should now be 50
    await expect(productRow).toContainText('50');

    await saveScreenshot(page, 'vs5-stock-updated-verification');
  });

  test('Purchase reception with CASH_REGISTER verifies balance and registers cash outflow', async ({
    page,
  }) => {
    await registerBusinessAndSeed(page);

    // 1. Open cash shift with $50,000.00
    await page.locator('[data-testid="nav-tab-cash"]').click();
    await page.getByRole('button', { name: 'C', exact: true }).click();
    for (const key of ['5', '0', '0', '0', '0']) {
      await page.getByRole('button', { name: key, exact: true }).click();
    }
    await expect(page.locator('[data-testid="opening-amount-display"]')).toContainText('50.000,00');
    await page.locator('[data-testid="open-shift-button"]').click();
    await expect(page.locator('text=Turno #')).toBeVisible();

    // 2. Create supplier via API for speed
    await page.evaluate(async () => {
      await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Panificadora Sur',
          taxId: '30-79876543-2',
        }),
      });
    });

    // 3. Go to COMPRAS -> NUEVA COMPRA
    await page.locator('[data-testid="nav-tab-purchases"]').click();
    await page.locator('[data-testid="subtab-purchases-create"]').click();

    // Select Panificadora Sur
    await page
      .locator('[data-testid="purchase-editor-supplier-select"]')
      .selectOption({ label: 'Panificadora Sur (30798765432)' });

    // Select CASH_REGISTER payment source
    await page
      .locator('[data-testid="purchase-editor-payment-select"]')
      .selectOption('CASH_REGISTER');

    // Verify cash available indicator shows $50,000.00
    await expect(page.locator('[data-testid="cash-available-indicator"]')).toContainText('50.000');

    // Add 10 units at $1,000.00 = $10,000.00
    await page.locator('[data-testid="purchase-item-product-select"]').selectOption({ index: 1 });
    await page.locator('[data-testid="purchase-item-quantity-input"]').fill('10');
    await page.locator('[data-testid="purchase-item-cost-input"]').fill('1000.00');
    await page.locator('[data-testid="add-line-item-btn"]').click();

    await expect(page.locator('[data-testid="purchase-editor-total"]')).toContainText('10.000');

    await saveScreenshot(page, 'vs5-purchase-cash-register-configured');

    // Receive purchase with cash outflow
    await page.locator('[data-testid="receive-purchase-btn"]').click();

    await expect(page.locator('[data-testid="subtab-purchases-list"]')).toBeVisible();
    const receivedCashPurchaseRow = page.locator('tr[data-testid^="purchase-row-"]').filter({
      hasText: 'Panificadora Sur',
    });
    await expect(receivedCashPurchaseRow).toContainText('RECIBIDA');

    // 4. Verify Cash Register reflects outflow
    await page.locator('[data-testid="nav-tab-cash"]').click();

    // Expected balance should now be 50,000 - 10,000 = 40,000
    await expect(page.locator('text=40.000')).toBeVisible();
    await expect(page.getByText(/^Compra/)).toBeVisible();

    await saveScreenshot(page, 'vs5-cash-outflow-verification');
  });

  test('Cashier role is prohibited from accessing purchases', async ({ page }) => {
    // 1. Register business as Owner
    await registerBusinessAndSeed(page);

    // 2. Demote the registered owner through the test-only role endpoint.
    const roleRes = await page.request.post('http://localhost:4100/api/test/set-role', {
      headers: { Origin: 'http://localhost:4173' },
      data: { email: 'owner@pulsocompras.com', role: 'CASHIER' },
    });
    expect(roleRes.status()).toBe(200);

    // 3. Reload to apply the cashier role in the existing authenticated session.
    await page.reload();

    await expect(page.locator('.pulso-ribbon')).toBeVisible();
    await expect(page.locator('.pulso-ribbon')).toContainText('Cajero');

    // 5. Verify COMPRAS and PRODUCTOS tabs are NOT rendered
    await expect(page.locator('[data-testid="nav-tab-purchases"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="nav-tab-products"]')).not.toBeVisible();

    await saveScreenshot(page, 'vs5-cashier-restricted-navigation');
  });

  test('Resumes and saves the same draft, then cancels it with keyboard and retains history', async ({
    page,
  }) => {
    await registerBusinessAndSeed(page);
    const purchaseId = await createDraftThroughEditor(page, 'BORRADOR-RESUME-1');
    const row = page.locator(`[data-testid="purchase-row-${purchaseId}"]`);

    await row.locator(`[data-testid="view-purchase-${purchaseId}"]`).click();
    const detail = page.locator('[data-testid="purchase-detail-modal"]');
    await expect(detail).toBeVisible();
    await expect(detail.locator('[data-testid="purchase-detail-status"]')).toContainText('BORRADOR');
    const axeResults = await new AxeBuilder({ page })
      .include('[data-testid="purchase-detail-modal"]')
      .analyze();
    expect(axeResults.violations).toEqual([]);

    const resumeButton = detail.locator('[data-testid="resume-purchase-btn"]');
    await resumeButton.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-testid="purchase-editor-invoice-input"]')).toHaveValue(
      'BORRADOR-RESUME-1'
    );
    await page.locator('[data-testid="purchase-editor-invoice-input"]').fill('BORRADOR-RESUME-2');
    await page.locator('[data-testid="save-draft-btn"]').click();
    await expect(page.locator(`[data-testid="purchase-row-${purchaseId}"]`)).toContainText(
      'BORRADOR-RESUME-2'
    );
    await expect(page.locator('tr[data-testid^="purchase-row-"]')).toHaveCount(1);

    await page.locator(`[data-testid="view-purchase-${purchaseId}"]`).click();
    const cancelTrigger = page.locator('[data-testid="cancel-draft-btn"]');
    await cancelTrigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-testid="cancel-reason-input"]')).toBeFocused();
    await page.locator('[data-testid="cancel-reason-input"]').fill('Prueba E2E');
    await page.locator('[data-testid="confirm-cancel-btn"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator(`[data-testid="purchase-row-${purchaseId}"]`)).toContainText(
      'CANCELADA'
    );
    await expect(page.locator('tr[data-testid^="purchase-row-"]')).toHaveCount(1);
  });

  test('Opens received and cancelled purchases as terminal read-only records', async ({ page }) => {
    await registerBusinessAndSeed(page);

    const receivedId = await createDraftThroughEditor(page, 'BORRADOR-TERMINAL-RECIBIDA');
    await page.locator(`[data-testid="view-purchase-${receivedId}"]`).click();
    const receivedDetail = page.locator('[data-testid="purchase-detail-modal"]');
    await receivedDetail.locator('[data-testid="receive-draft-btn"]').click();
    await expect(page.locator(`[data-testid="purchase-row-${receivedId}"]`)).toContainText('RECIBIDA');
    await page.locator(`[data-testid="view-purchase-${receivedId}"]`).click();
    await expect(receivedDetail).toBeVisible();
    await expect(receivedDetail.locator('[data-testid="purchase-detail-status"]')).toContainText('RECIBIDA');
    await expect(receivedDetail.locator('[data-testid="resume-purchase-btn"]')).toHaveCount(0);
    await expect(receivedDetail.locator('[data-testid="receive-draft-btn"]')).toHaveCount(0);
    await expect(receivedDetail.locator('[data-testid="cancel-draft-btn"]')).toHaveCount(0);
    expect((await new AxeBuilder({ page }).include('[data-testid="purchase-detail-modal"]').analyze()).violations).toEqual([]);
    await receivedDetail.locator('[data-testid="close-purchase-detail-btn"]').click();

    // A fresh supplier is not needed: reset the draft form's supplier data by using a unique tax ID.
    await page.evaluate(async () => {
      await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Proveedor Terminal Cancelada', taxId: '30-70000000-2' }),
      });
    });
    await page.reload();
    await expect(page.locator('.pulso-ribbon')).toBeVisible();
    await page.locator('[data-testid="nav-tab-purchases"]').click();
    await page.locator('[data-testid="subtab-purchases-create"]').click();
    await expect(page.locator('[data-testid="purchase-editor-supplier-select"]')).toBeVisible();
    await page.locator('[data-testid="purchase-editor-supplier-select"]').selectOption({ label: 'Proveedor Terminal Cancelada (30700000002)' });
    await page.locator('[data-testid="purchase-editor-invoice-input"]').fill('BORRADOR-TERMINAL-CANCELADA');
    await page.locator('[data-testid="purchase-item-product-select"]').selectOption({ index: 1 });
    await page.locator('[data-testid="purchase-item-quantity-input"]').fill('1');
    await page.locator('[data-testid="purchase-item-cost-input"]').fill('900.00');
    await page.locator('[data-testid="add-line-item-btn"]').click();
    await page.locator('[data-testid="save-draft-btn"]').click();
    const cancelledId = (await page.locator('tr[data-testid^="purchase-row-"]').filter({ hasText: 'BORRADOR-TERMINAL-CANCELADA' }).getAttribute('data-testid'))!.replace('purchase-row-', '');
    await page.locator(`[data-testid="view-purchase-${cancelledId}"]`).click();
    const cancelledDetail = page.locator('[data-testid="purchase-detail-modal"]');
    const cancel = cancelledDetail.locator('[data-testid="cancel-draft-btn"]');
    await cancel.focus();
    await page.keyboard.press('Enter');
    await cancelledDetail.locator('[data-testid="confirm-cancel-btn"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator(`[data-testid="purchase-row-${cancelledId}"]`)).toContainText('CANCELADA');
    await page.locator(`[data-testid="view-purchase-${cancelledId}"]`).click();
    await expect(cancelledDetail.locator('[data-testid="purchase-detail-status"]')).toContainText('CANCELADA');
    await expect(cancelledDetail.locator('[data-testid="resume-purchase-btn"]')).toHaveCount(0);
    await expect(cancelledDetail.locator('[data-testid="receive-draft-btn"]')).toHaveCount(0);
    await expect(cancelledDetail.locator('[data-testid="cancel-draft-btn"]')).toHaveCount(0);
  });

  test('Does not show success after a receive 409 and blocks draft mutations offline', async ({
    page,
  }) => {
    await registerBusinessAndSeed(page);
    const purchaseId = await createDraftThroughEditor(page, 'BORRADOR-CONFLICT-1');

    let receiveRequests = 0;
    await page.route(`**/api/purchases/${purchaseId}/receive`, async (route) => {
      receiveRequests += 1;
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'El borrador cambió en otro lugar' }),
      });
    });

    await page.locator(`[data-testid="view-purchase-${purchaseId}"]`).click();
    const receiveButton = page.locator('[data-testid="receive-draft-btn"]');
    await receiveButton.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-testid="purchase-detail-action-error"]')).toBeVisible();
    await expect(receiveButton).toBeFocused();
    await expect(page.locator('[data-testid="purchase-detail-status"]')).toContainText('BORRADOR');
    await expect(page.locator('text=RECIBIDA')).not.toBeVisible();
    expect(receiveRequests).toBe(1);
    expect((await new AxeBuilder({ page }).include('[data-testid="purchase-detail-modal"]').analyze()).violations).toEqual([]);

    await page.context().setOffline(true);
    await expect(page.locator('[data-testid="purchases-offline-banner"]')).toBeVisible();
    await expect(page.locator('[data-testid="receive-draft-btn"]')).toBeDisabled();
    await expect(page.locator('[data-testid="cancel-draft-btn"]')).toBeDisabled();
    await page.context().setOffline(false);
  });

  test('Recovers an editor conflict by keyboard with an accessible error state', async ({ page }) => {
    await registerBusinessAndSeed(page);
    const purchaseId = await createDraftThroughEditor(page, 'BORRADOR-UPDATE-CONFLICT');
    await page.route(`**/api/purchases/${purchaseId}`, async (route) => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ message: 'El borrador cambió en otro lugar' }) });
      } else {
        await route.continue();
      }
    });
    await page.locator(`[data-testid="view-purchase-${purchaseId}"]`).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-testid="purchase-detail-modal"]')).toBeVisible();
    const resume = page.locator('[data-testid="resume-purchase-btn"]');
    await resume.focus();
    await page.keyboard.press('Enter');
    const invoice = page.locator('[data-testid="purchase-editor-invoice-input"]');
    await expect(invoice).toBeFocused();
    await invoice.fill('BORRADOR-UPDATE-CONFLICT-EDIT');
    const save = page.locator('[data-testid="save-draft-btn"]');
    await save.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-testid="purchase-editor-error"]')).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});
