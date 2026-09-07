import { test, expect, type Page } from '@playwright/test';
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
  businessName = 'Kiosco Pulso Centro',
  locationName = 'Sucursal Principal',
  ownerName = 'Dueño Operativo',
  email = 'dueno@pulsocentro.com',
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

  // Seed standard products
  await page.evaluate(async () => {
    const catRes = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Golosinas' }),
    });
    const category = await catRes.json();

    await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Alfajor Triple Dulce de Leche',
        categoryId: category.id,
        barcode: '779001',
        sku: 'ALF-01',
        salePriceCents: 120000,
        costPriceCents: 75000,
        initialStock: '50.0000',
        minimumStock: '10.0000',
        quickSlot: 1,
      }),
    });
  });

  await page.reload();
  await expect(page.locator('.pulso-ribbon')).toBeVisible();
  await expect(page.locator('button:has-text("Alfajor Triple Dulce de Leche")')).toBeVisible();
}

test.describe('Vertical Slice 4 — Caja, Turnos y Arqueo de Efectivo E2E Suite', () => {
  test('Attempting sale without open shift warns cashier and preserves cart intact', async ({
    page,
  }) => {
    await registerBusinessAndSeed(page);

    // 1. Ensure operational ribbon shows no open shift
    const ribbon = page.locator('.pulso-ribbon');
    await expect(ribbon).toContainText('Sin turno abierto');

    // 2. Add product to cart in Mostrador
    await page.locator('button:has-text("Alfajor Triple Dulce de Leche")').first().click();

    // Verify product is in cart
    const receipt = page.locator('.live-receipt-container');
    await expect(receipt).toContainText('Alfajor Triple Dulce de Leche');
    await expect(receipt).toContainText('$ 1.200,00');

    // 3. Click Cobrar button
    const cobrarBtn = page.locator('button:has-text("COBRAR EN EFECTIVO")');
    await cobrarBtn.click();

    // 4. Assert warning appears and MoneyKeypad is NOT opened
    await expect(
      page.locator('text=No hay un turno de caja abierto en esta sucursal')
    ).toBeVisible();
    await expect(page.locator('text=TOTAL A COBRAR')).not.toBeVisible();

    // 5. Verify cart is NOT lost
    await expect(receipt).toContainText('Alfajor Triple Dulce de Leche');
    await expect(receipt).toContainText('$ 1.200,00');

    await saveScreenshot(page, 'vs4-sale-blocked-no-shift');
  });

  test('Complete cash shift flow: opening, cash sale, manual movements, exact and difference closings, and history', async ({
    page,
  }) => {
    await registerBusinessAndSeed(page);

    // STEP 1: Put product in cart
    await page.locator('button:has-text("Alfajor Triple Dulce de Leche")').first().click();
    const receipt = page.locator('.live-receipt-container');
    await expect(receipt).toContainText('Alfajor Triple Dulce de Leche');

    // STEP 2: Navigate to CAJA tab
    await page.locator('[data-testid="nav-tab-cash"]').click();
    await expect(page.locator('h2:has-text("SIN TURNO ABIERTO")')).toBeVisible();
    await saveScreenshot(page, 'vs4-caja-sin-turno');

    // STEP 3: Open shift with $5.000,00 initial float
    // Click "$5.000" preset button
    await page.locator('button:has-text("$5.000")').click();
    await expect(page.locator('[data-testid="opening-amount-display"]')).toContainText('5.000,00');

    // Submit opening
    await page.locator('[data-testid="open-shift-button"]').click();

    // Verify shift is open
    await expect(page.locator('text=TURNO DE CAJA ABIERTO')).toBeVisible();
    await expect(page.locator('[data-testid="kpi-opening-amount"]')).toContainText('5.000,00');
    await expect(page.locator('[data-testid="kpi-expected-amount"]')).toContainText('5.000,00');
    await saveScreenshot(page, 'vs4-caja-turno-abierto');

    // STEP 4: Return to MOSTRADOR, complete cash sale
    await page.locator('[data-testid="nav-tab-pos"]').click();
    // Cart must still be intact!
    await expect(receipt).toContainText('Alfajor Triple Dulce de Leche');

    // Cobrar sale
    await page.locator('button:has-text("COBRAR EN EFECTIVO")').click();
    const tenderModal = page.locator('[role="dialog"][aria-label="Cobro en efectivo"]');
    await expect(tenderModal).toBeVisible();

    await tenderModal.locator('button:has-text("EXACTO")').click();
    await tenderModal.locator('button:has-text("CONFIRMAR COBRO")').click();

    // Confirm success seal
    const successSeal = page.locator('[role="status"]:has-text("VENTA CONFIRMADA")');
    await expect(successSeal).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(successSeal).not.toBeVisible();

    // STEP 5: Back to CAJA - verify sales ledger impact
    await page.locator('[data-testid="nav-tab-cash"]').click();
    await expect(page.locator('[data-testid="kpi-cash-sales-amount"]')).toContainText('1.200,00');
    await expect(page.locator('[data-testid="kpi-expected-amount"]')).toContainText('6.200,00');

    // STEP 6: Manual Cash In
    await page.locator('[data-testid="open-cash-in-modal-button"]').click();
    await expect(page.locator('text=Ingreso Manual de Efectivo')).toBeVisible();

    await page.locator('[data-testid="movement-reason-input"]').fill('Cambio chico para sencillo');
    // Keypad: 5, 0, 0 -> 500 pesos = $500,00 (50000 cents)
    const modalKeypad = page.locator('div[style*="grid-template-columns: repeat(3, 1fr)"]');
    await modalKeypad.locator('button:has-text("5")').click();
    await modalKeypad.locator('button:has-text("0")').click();
    await modalKeypad.locator('button:has-text("0")').click();

    await page.locator('[data-testid="confirm-movement-button"]').click();

    // Verify Cash In updated: +$500 -> expected = $6.700,00
    await expect(page.locator('[data-testid="kpi-cash-in-amount"]')).toContainText('500,00');
    await expect(page.locator('[data-testid="kpi-expected-amount"]')).toContainText('6.700,00');

    // STEP 7: Manual Cash Out
    await page.locator('[data-testid="open-cash-out-modal-button"]').click();
    await expect(page.locator('text=Retiro Manual de Efectivo')).toBeVisible();

    await page.locator('[data-testid="movement-reason-input"]').fill('Pago de hielo y soda');
    // Keypad: 2, 0, 0 -> 200 pesos = $200,00 (20000 cents)
    await modalKeypad.locator('button:has-text("2")').click();
    await modalKeypad.locator('button:has-text("0")').click();
    await modalKeypad.locator('button:has-text("0")').click();

    await page.locator('[data-testid="confirm-movement-button"]').click();

    // Verify Cash Out updated: -$200 -> expected = $6.500,00
    await expect(page.locator('[data-testid="kpi-cash-out-amount"]')).toContainText('200,00');
    await expect(page.locator('[data-testid="kpi-expected-amount"]')).toContainText('6.500,00');
    await saveScreenshot(page, 'vs4-caja-movimientos-registrados');

    // STEP 8: Exact Shift Close (Arqueo Exacto)
    await page.locator('[data-testid="open-close-shift-modal-button"]').click();
    await expect(page.locator('text=Cierre y Arqueo de Caja')).toBeVisible();

    // Use shortcut to copy exact expected amount
    await page.locator('button:has-text("Copiar monto esperado")').click();
    const diffBadge = page.locator('[data-testid="close-difference-badge"]');
    await expect(diffBadge).toContainText('ARQUEO EXACTO');

    // Confirm checkbox
    await page.locator('[data-testid="confirm-close-checkbox"]').click();
    await page.locator('[data-testid="submit-close-shift-button"]').click();

    // Verify Closed Summary View
    await expect(page.locator('text=Turno de Caja Cerrado')).toBeVisible();
    await expect(page.locator('[data-testid="shift-closed-difference-banner"]')).toContainText(
      'ARQUEO EXACTO'
    );
    await saveScreenshot(page, 'vs4-caja-cierre-exacto');

    // STEP 9: Start New Shift
    await page.locator('[data-testid="start-new-shift-button"]').click();
    await expect(page.locator('h2:has-text("SIN TURNO ABIERTO")')).toBeVisible();

    // Open Shift #2 with $10.000 float
    await page.locator('button:has-text("$10.000")').click();
    await page.locator('[data-testid="open-shift-button"]').click();
    await expect(page.locator('text=TURNO DE CAJA ABIERTO')).toBeVisible();
    await expect(page.locator('[data-testid="kpi-opening-amount"]')).toContainText('10.000,00');

    // STEP 10: Close Shift #2 with Difference (Faltante)
    await page.locator('[data-testid="open-close-shift-modal-button"]').click();

    // Enter counted: 9, 5, 0, 0 -> 9500 pesos = $9.500,00 (Faltante de $500,00)
    const closeKeypad = page.locator('div[style*="grid-template-columns: repeat(3, 1fr)"]');
    await closeKeypad.locator('button:has-text("9")').click();
    await closeKeypad.locator('button:has-text("5")').click();
    await closeKeypad.locator('button:has-text("0")').click();
    await closeKeypad.locator('button:has-text("0")').click();

    await expect(page.locator('[data-testid="close-difference-badge"]')).toContainText(
      'FALTANTE DE CAJA'
    );

    await page.locator('[data-testid="confirm-close-checkbox"]').click();
    await page.locator('[data-testid="submit-close-shift-button"]').click();

    await expect(page.locator('text=Turno de Caja Cerrado')).toBeVisible();
    await expect(page.locator('[data-testid="shift-closed-difference-banner"]')).toContainText(
      'FALTANTE DE CAJA'
    );
    await saveScreenshot(page, 'vs4-caja-cierre-faltante');

    // STEP 11: Inspect History and Detail Modal
    await page.locator('[data-testid="cash-subtab-history"]').click();
    await expect(page.locator('h2:has-text("Historial de Turnos de Caja")')).toBeVisible();

    // Table should contain at least 2 closed shifts
    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(2);

    // Click DETALLE button on first row to open detail modal
    await rows.first().locator('button:has-text("DETALLE")').click();
    await expect(page.locator('[data-testid="shift-detail-modal"]')).toBeVisible();
    await expect(page.locator('text=Movimientos Registrados')).toBeVisible();

    // Close detail modal
    await page.locator('button[aria-label="Cerrar ventana"]').click();
    await expect(page.locator('[data-testid="shift-detail-modal"]')).not.toBeVisible();
    await saveScreenshot(page, 'vs4-caja-historial');
  });
});
