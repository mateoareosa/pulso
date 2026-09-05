import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import AxeBuilder from '@axe-core/playwright';

const SCREENSHOTS_DIR = path.resolve(process.cwd(), 'e2e/screenshots');

test.beforeAll(() => {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }
});

test.beforeEach(async ({ page }) => {
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

async function registerBusiness(
  page: Page,
  businessName = 'Kiosco Catálogo Test',
  locationName = 'Casa Central',
  ownerName = 'Dueño Catálogo',
  email = 'catalogo@pulso.dev',
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
}

test.describe('Vertical Slice 2 — Persistent Catalog, Manual Inventory & Quick Slots E2E Suite', () => {
  test('1. Empty Catalog Experience on New Registration & POS State', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await registerBusiness(page, 'Kiosco Vacío', 'Central', 'Dueño', 'vacio@kiosco.com');

    // POS ribbon shows business name
    const ribbon = page.locator('.pulso-ribbon');
    await expect(ribbon).toContainText('Kiosco Vacío');

    // POS search shows empty state
    await expect(page.locator('text=Esperando productos...')).toBeVisible();

    // Owner sees navigation tabs MOSTRADOR and PRODUCTOS
    await expect(page.locator('button:has-text("MOSTRADOR")')).toBeVisible();
    await expect(page.locator('button:has-text("PRODUCTOS")')).toBeVisible();

    // Navigate to PRODUCTOS
    await page.locator('button:has-text("PRODUCTOS")').click();
    await expect(page.locator('h1:has-text("Productos e Inventario")')).toBeVisible();
    await expect(page.locator('text=El catálogo está vacío.')).toBeVisible();
    await expect(page.locator('button:has-text("CREAR PRIMER PRODUCTO")')).toBeVisible();
  });

  test('2. Management UI: Create Category, Create Product with Price & Stock, Assign Slot, and Sell via Keyboard Shortcut', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await registerBusiness(
      page,
      'Kiosco Dulzuras',
      'Central',
      'Dueño Dulzuras',
      'dulzuras@kiosco.com'
    );

    // 1. Go to PRODUCTOS
    await page.locator('button:has-text("PRODUCTOS")').click();
    await expect(page.locator('h1:has-text("Productos e Inventario")')).toBeVisible();

    // 2. Open Product Creation Modal
    await page.locator('button:has-text("NUEVO PRODUCTO")').click();
    await expect(page.locator('h2:has-text("ALTA DE PRODUCTO")')).toBeVisible();

    // 3. Create a Category inline
    await page.locator('button:has-text("+ Nueva categoría")').click();
    await page.locator('input[placeholder="Nombre de nueva categoría..."]').fill('Chocolates');
    await page.getByRole('button', { name: 'Crear', exact: true }).click();

    // 4. Fill Product Form
    await page
      .locator('input[placeholder="Ej: Alfajor Triple Chocolate"]')
      .fill('Barra Chocolate Amargo 70%');
    await page.locator('input[placeholder="779..."]').fill('77990001');
    await page.locator('input[placeholder="ALF-001"]').fill('CHO-01');
    await page.locator('input[placeholder="1200.00"]').fill('2500.00');
    await page.locator('input[placeholder="750.00"]').fill('1500.00');
    await page.locator('input[placeholder="50"]').fill('30');

    // Select Slot 1
    await page
      .locator('select')
      .filter({ hasText: 'Sin slot rápido' })
      .selectOption({ label: 'Slot [1]' });

    // Submit Product
    await page.locator('button:has-text("CREAR PRODUCTO")').click();

    // Verify modal closed and row exists in table
    await expect(page.locator('h2:has-text("ALTA DE PRODUCTO")')).not.toBeVisible();
    const table = page.locator('table');
    await expect(table).toContainText('Barra Chocolate Amargo 70%');
    await expect(table).toContainText('$ 2.500,00');
    await expect(table).toContainText('30');
    await expect(table).toContainText('[1]');

    // 5. Navigate to MOSTRADOR and test immediate slot activation
    await page.locator('button:has-text("MOSTRADOR")').click();
    const posSlot1 = page.locator('button:has-text("Barra Chocolate Amargo 70%")');
    await expect(posSlot1).toBeVisible();

    // Press key '1' on physical keyboard
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.keyboard.press('1');

    // Verify product added to receipt
    const receipt = page.locator('.live-receipt-container');
    await expect(receipt).toContainText('Barra Chocolate Amargo 70%');
    await expect(receipt).toContainText('$ 2.500,00');
  });

  test('3. Stock Adjustment Modal with Projected Stock Calculation and History Traceability', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await registerBusiness(page, 'Kiosco Stock Test', 'Central', 'Dueño Stock', 'stock@kiosco.com');

    // Create a product via API for setup
    await page.evaluate(async () => {
      await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Alfajor Glaseado Test',
          salePriceCents: 100000,
          initialStock: '20.0000',
          minimumStock: '5.0000',
        }),
      });
    });

    // Go to PRODUCTOS screen
    await page.locator('button:has-text("PRODUCTOS")').click();
    await expect(page.locator('table')).toContainText('Alfajor Glaseado Test');

    // Click Stock button
    const stockBtn = page.locator('button[title="Ajustar stock"]').first();
    await stockBtn.click();

    // Verify adjustment dialog opened
    const adjustModal = page.locator('[role="dialog"][aria-label="Ajuste Manual de Inventario"]');
    await expect(adjustModal).toBeVisible();
    await expect(adjustModal).toContainText('Stock actual:');
    await expect(adjustModal).toContainText('20');

    // Enter quantity 15
    await adjustModal.locator('input[placeholder="Ej: 10"]').fill('15');
    await expect(adjustModal).toContainText('Stock proyectado:');
    await expect(adjustModal).toContainText('35');

    // Fill reason
    await adjustModal
      .locator('input[placeholder*="Llegada de proveedor"]')
      .fill('Ingreso por reposición semanal');

    // Confirm adjustment
    await adjustModal.locator('button:has-text("APLICAR AJUSTE")').click();
    await expect(adjustModal).not.toBeVisible();

    // Verify table updated to 35
    await expect(page.locator('table')).toContainText('35');

    // Open Movements History Modal
    const historyBtn = page.locator('button[title="Ver movimientos"]').first();
    await historyBtn.click();

    const historyModal = page.locator('[role="dialog"][aria-label="Historial de Movimientos"]');
    await expect(historyModal).toBeVisible();
    await expect(historyModal).toContainText('HISTORIAL DE MOVIMIENTOS');
    await expect(historyModal).toContainText('+15');
    await expect(historyModal).toContainText('Ingreso por reposición semanal');

    // Close modal by clicking top close button
    await historyModal.locator('button').first().click();
    await expect(historyModal).not.toBeVisible();
  });

  test('4. Exact Barcode Match Priority and Name Search in Mostrador', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await registerBusiness(
      page,
      'Kiosco Barcode Test',
      'Central',
      'Dueño Barcode',
      'barcode@kiosco.com'
    );

    // Seed 2 products: one whose name contains barcode digits, and one with exact barcode
    await page.evaluate(async () => {
      await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Producto Código 7799988 Nombre',
          barcode: '111111',
          salePriceCents: 50000,
          initialStock: '10.0000',
        }),
      });

      await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Chupetín Frutal',
          barcode: '7799988',
          salePriceCents: 30000,
          initialStock: '15.0000',
        }),
      });
    });

    await page.reload();

    const searchInput = page.locator('input[aria-label="Escanear o buscar producto"]');

    // Exact barcode search selects exact barcode product first
    await searchInput.fill('7799988');
    await expect(page.locator('button:has-text("Chupetín Frutal")')).toBeVisible();

    // Hit Enter to add to receipt
    await page.keyboard.press('Enter');
    const receipt = page.locator('.live-receipt-container');
    await expect(receipt).toContainText('Chupetín Frutal');
  });

  test('5. Role Authorization: CASHIER is restricted from Products administration (UI & API 403)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await registerBusiness(page, 'Kiosco Permisos', 'Central', 'Cajero Juan', 'cajero@kiosco.com');

    // Demote role to CASHIER via exclusive test endpoint
    const roleRes = await page.request.post('http://localhost:4100/api/test/set-role', {
      headers: { Origin: 'http://localhost:4173' },
      data: { email: 'cajero@kiosco.com', role: 'CASHIER' },
    });
    expect(roleRes.status()).toBe(200);

    // Reload page to apply cashier role in session
    await page.reload();

    // 1. UI Check: Navigation tabs are completely absent for CASHIER
    await expect(page.locator('button:has-text("PRODUCTOS")')).not.toBeVisible();
    await expect(page.locator('.pulso-ribbon')).toContainText('Cajero Juan (Cajero)');

    // 2. API Security Check: Cashier cannot write to catalog endpoints
    const forbiddenChecks = await page.evaluate(async () => {
      const createProduct = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Hacked', salePriceCents: 100 }),
      });

      const createCategory = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Hacked' }),
      });

      const adjustStock = await fetch(
        '/api/products/00000000-0000-0000-0000-000000000000/stock-adjustments',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'ADJUSTMENT_IN',
            quantity: '10',
            reason: 'Ajuste no autorizado',
          }),
        }
      );

      return {
        productStatus: createProduct.status,
        categoryStatus: createCategory.status,
        adjustStatus: adjustStock.status,
      };
    });

    expect(forbiddenChecks.productStatus).toBe(403);
    expect(forbiddenChecks.categoryStatus).toBe(403);
    expect(forbiddenChecks.adjustStatus).toBe(403);
  });

  test('6. Multi-Tenant Isolation: Tenant B cannot access or view Tenant A catalog items', async ({
    page,
    browser,
  }) => {
    // 1. Tenant A registers and creates a unique product
    await registerBusiness(
      page,
      'Tenant Alpha Negocio',
      'Central',
      'Owner Alpha',
      'alpha@tenant.com'
    );
    await page.evaluate(async () => {
      await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Producto Exclusivo Alpha 999',
          barcode: '999000111',
          salePriceCents: 450000,
          initialStock: '10.0000',
        }),
      });
    });

    // 2. Tenant B registers in separate isolated context
    const contextB = await browser.newContext({ baseURL: 'http://localhost:4173' });
    const pageB = await contextB.newPage();
    await registerBusiness(
      pageB,
      'Tenant Beta Negocio',
      'Central',
      'Owner Beta',
      'beta@tenant.com'
    );

    // Tenant B POS initially shows empty branch message
    await expect(
      pageB.locator('text=No hay productos registrados en esta sucursal.')
    ).toBeVisible();

    // Tenant B searches in POS for Alpha's product (empty search result is shown)
    const searchB = pageB.locator('input[aria-label="Escanear o buscar producto"]');
    await searchB.fill('Alpha 999');
    await expect(pageB.locator('text=Producto no encontrado para "Alpha 999"')).toBeVisible();
    await expect(pageB.locator('text=Producto Exclusivo Alpha 999')).not.toBeVisible();

    // Tenant B navigates to PRODUCTOS screen
    await pageB.locator('button:has-text("PRODUCTOS")').click();
    await expect(pageB.locator('text=El catálogo está vacío.')).toBeVisible();
    await expect(pageB.locator('table')).not.toBeVisible();

    await contextB.close();
  });

  test('7. Offline Catalog Resilience: Search and POS function seamlessly with IndexedDB cache', async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await registerBusiness(
      page,
      'Kiosco Offline Cache',
      'Central',
      'Dueño Cache',
      'cache@kiosco.com'
    );

    // Create product with slot 1
    await page.evaluate(async () => {
      await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Alfajor Offline Especial',
          barcode: '779888999',
          salePriceCents: 150000,
          initialStock: '25.0000',
          quickSlot: 1,
        }),
      });
    });

    await page.reload();
    await expect(page.locator('button:has-text("Alfajor Offline Especial")')).toBeVisible();

    // Simulate network drop
    await context.setOffline(true);
    const connectionBtn = page.locator('button[aria-label*="Estado de conexión"]');
    await connectionBtn.click();
    await expect(connectionBtn).toContainText('SIN CONEXIÓN');

    // Search product offline in IndexedDB
    const searchInput = page.locator('input[aria-label="Escanear o buscar producto"]');
    await searchInput.fill('Offline Especial');
    await expect(page.locator('button:has-text("Alfajor Offline Especial")')).toBeVisible();

    // Add via Enter
    await page.keyboard.press('Enter');

    const receipt = page.locator('.live-receipt-container');
    await expect(receipt).toContainText('Alfajor Offline Especial');
  });

  test('8. Accessibility Audit (Axe WCAG AA) on ProductsScreen (Day & Night Modes)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await registerBusiness(
      page,
      'Kiosco A11y Admin',
      'Central',
      'Dueño A11y',
      'a11y-admin@kiosco.com'
    );

    // Create a product so table is populated
    await page.evaluate(async () => {
      await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Alfajor A11y Test',
          barcode: '779111222',
          salePriceCents: 120000,
          initialStock: '50.0000',
          quickSlot: 1,
        }),
      });
    });

    // Navigate to PRODUCTOS screen
    await page.locator('button:has-text("PRODUCTOS")').click();
    await expect(page.locator('h1:has-text("Productos e Inventario")')).toBeVisible();

    // 1. Audit Day Mode
    await saveScreenshot(page, 'productos-modo-dia-1280x720');
    const dayScan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(dayScan.violations).toEqual([]);

    // 2. Toggle to Night Mode
    const themeBtn = page.locator('button[aria-label*="Cambiar a modo"]').first();
    await themeBtn.click();
    await expect(page.locator('div[data-theme="night"]')).toBeVisible();

    // 3. Audit Night Mode
    await saveScreenshot(page, 'productos-modo-noche-1280x720');
    const nightScan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(nightScan.violations).toEqual([]);
  });

  const VIEWPORTS = [
    { width: 1024, height: 768, label: '1024x768' },
    { width: 1280, height: 720, label: '1280x720' },
    { width: 1440, height: 900, label: '1440x900' },
  ];

  for (const vp of VIEWPORTS) {
    test(`9. ProductsScreen Responsiveness & Zero Horizontal Overflow (${vp.label})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await registerBusiness(
        page,
        'Kiosco Viewport Test',
        'Central',
        'Dueño VP',
        `vp-${vp.label}@kiosco.com`
      );

      await page.locator('button:has-text("PRODUCTOS")').click();
      await expect(page.locator('h1:has-text("Productos e Inventario")')).toBeVisible();

      // Check no horizontal overflow
      const hasHorizontalOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(hasHorizontalOverflow).toBe(false);
    });
  }

  test('10. Large Catalog (> 100 products), Pagination, Inactive Product Filtering & Branch Availability in Mostrador and Admin', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await registerBusiness(
      page,
      'Kiosco Cien Productos',
      'Central',
      'Dueño Cien',
      'cien@kiosco.com'
    );

    // Create 101 products via API
    await page.evaluate(async () => {
      const items = [];
      for (let i = 1; i <= 101; i++) {
        items.push({
          name: `Producto Lote ${i.toString().padStart(3, '0')}`,
          barcode: `779000000${i.toString().padStart(3, '0')}`,
          salePriceCents: 10000 + i * 100,
          initialStock: '10.0000',
          quickSlot: i <= 8 && i !== 5 ? i : null,
          isAvailable: i !== 5, // Product 5 is unavailable in branch
        });
      }

      for (let i = 0; i < items.length; i += 20) {
        const batch = items.slice(i, i + 20);
        await Promise.all(
          batch.map((dto) =>
            fetch('/api/products', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(dto),
            })
          )
        );
      }
    });

    // 1. Check in Mostrador: search and add product 101
    const searchInput = page.locator('input[aria-label="Escanear o buscar producto"]');
    await searchInput.fill('Producto Lote 101');
    await expect(page.locator('button:has-text("Producto Lote 101")')).toBeVisible();

    await page.keyboard.press('Enter');
    const receipt = page.locator('.live-receipt-container');
    await expect(receipt).toContainText('Producto Lote 101');

    // Verify unavailable product 5 is NOT visible in quick ribbon or search
    await searchInput.fill('Producto Lote 005');
    await expect(
      page.locator('text=Producto no encontrado para "Producto Lote 005"')
    ).toBeVisible();

    // 2. Navigate to PRODUCTOS screen
    await page.locator('button:has-text("PRODUCTOS")').click();
    await expect(page.locator('h1:has-text("Productos e Inventario")')).toBeVisible();

    // Check pagination controls
    await expect(page.locator('text=Página 1 de 3 (101 productos totales)')).toBeVisible();
    const nextBtn = page.locator('button:has-text("Siguiente")');
    await expect(nextBtn).toBeEnabled();
    await nextBtn.click();
    await expect(page.locator('text=Página 2 de 3 (101 productos totales)')).toBeVisible();

    // Check branch availability badge for product 5 (NO DISPONIBLE)
    const searchAdmin = page.locator('input[placeholder*="Buscar por nombre"]');
    await searchAdmin.fill('Producto Lote 005');
    await expect(page.locator('text=NO DISPONIBLE')).toBeVisible();
  });

  test('11. POS State Isolation from Admin Filters: INACTIVE filter does not corrupt Mostrador Quick Ribbon', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await registerBusiness(
      page,
      'Kiosco POS Isolation',
      'Central',
      'Dueño Isolation',
      'isolation@kiosco.com'
    );

    // 1. Create an active product with quickSlot: 1 and an inactive product via API
    await page.evaluate(async () => {
      // Active product in quick slot 1
      await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Alfajor Activo Slot 1',
          barcode: '779888001',
          salePriceCents: 15000,
          initialStock: '20.0000',
          quickSlot: 1,
        }),
      });

      // Inactive product
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Alfajor Descontinuado Inactivo',
          barcode: '779888002',
          salePriceCents: 12000,
          initialStock: '5.0000',
        }),
      });
      const created = await res.json();

      // Deactivate product
      await fetch(`/api/products/${created.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isActive: false,
        }),
      });
    });

    // 2. Navigate to PRODUCTOS admin screen
    await page.locator('button:has-text("PRODUCTOS")').click();
    await expect(page.locator('h1:has-text("Productos e Inventario")')).toBeVisible();

    // Select filter "Solo inactivos"
    await page.locator('#status-filter').selectOption('INACTIVE');

    // Confirm that the inactive product is displayed in the table and the active one is filtered out
    await expect(page.locator('table')).toContainText('Alfajor Descontinuado Inactivo');
    await expect(page.locator('table')).not.toContainText('Alfajor Activo Slot 1');

    // 3. Navigate back to Mostrador
    await page.locator('button:has-text("MOSTRADOR")').click();
    await expect(page.locator('span:has-text("TICKET DE VENTA")')).toBeVisible();

    // 4. Verify vendible quick ribbon is intact and operational!
    const quickItem = page.locator('button:has-text("Alfajor Activo Slot 1")');
    await expect(quickItem).toBeVisible();

    // Press shortcut [1] to add to sale
    await page.keyboard.press('1');
    const receipt = page.locator('.live-receipt-container');
    await expect(receipt).toContainText('Alfajor Activo Slot 1');
    await expect(receipt).toContainText('$ 150,00');

    // The inactive product must NOT appear in quick ribbon
    await expect(
      page.locator('button:has-text("Alfajor Descontinuado Inactivo")')
    ).not.toBeVisible();
  });
});
