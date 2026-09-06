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
  // Ensure completely clean database state before each test scenario on exclusive test API
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

async function seedDemoProducts(page: Page) {
  await page.evaluate(async () => {
    // 1. Create categories
    const catRes1 = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Golosinas' }),
    });
    const catGolosinas = await catRes1.json();

    const catRes2 = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bebidas' }),
    });
    const catBebidas = await catRes2.json();

    const catRes3 = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Snacks' }),
    });
    const catSnacks = await catRes3.json();

    // 2. Create the 8 demo products
    const items = [
      {
        name: 'Alfajor Triple Dulce de Leche',
        categoryId: catGolosinas.id,
        barcode: '779001',
        sku: 'ALF-01',
        salePriceCents: 120000,
        costPriceCents: 75000,
        initialStock: '50.0000',
        minimumStock: '10.0000',
        quickSlot: 1,
      },
      {
        name: 'Gaseosa Cola 500ml',
        categoryId: catBebidas.id,
        barcode: '779002',
        sku: 'BEB-01',
        salePriceCents: 150000,
        costPriceCents: 95000,
        initialStock: '50.0000',
        minimumStock: '10.0000',
        quickSlot: 2,
      },
      {
        name: 'Agua Mineral 500ml',
        categoryId: catBebidas.id,
        barcode: '779003',
        sku: 'BEB-02',
        salePriceCents: 100000,
        costPriceCents: 60000,
        initialStock: '50.0000',
        minimumStock: '10.0000',
        quickSlot: 3,
      },
      {
        name: 'Turrón de Maní',
        categoryId: catGolosinas.id,
        barcode: '779004',
        sku: 'GOL-02',
        salePriceCents: 45000,
        costPriceCents: 28000,
        initialStock: '50.0000',
        minimumStock: '10.0000',
        quickSlot: 4,
      },
      {
        name: 'Chicles Menta Fuerte',
        categoryId: catGolosinas.id,
        barcode: '779005',
        sku: 'GOL-03',
        salePriceCents: 60000,
        costPriceCents: 35000,
        initialStock: '50.0000',
        minimumStock: '10.0000',
        quickSlot: 5,
      },
      {
        name: 'Caramelos Ácidos x10',
        categoryId: catGolosinas.id,
        barcode: '779006',
        sku: 'GOL-04',
        salePriceCents: 80000,
        costPriceCents: 50000,
        initialStock: '50.0000',
        minimumStock: '10.0000',
        quickSlot: 6,
      },
      {
        name: 'Galletitas Rellenas Vainilla',
        categoryId: catSnacks.id,
        barcode: '779007',
        sku: 'SNK-01',
        salePriceCents: 180000,
        costPriceCents: 110000,
        initialStock: '50.0000',
        minimumStock: '10.0000',
        quickSlot: 7,
      },
      {
        name: 'Barra de Cereal Frutilla',
        categoryId: catSnacks.id,
        barcode: '779008',
        sku: 'SNK-02',
        salePriceCents: 90000,
        costPriceCents: 55000,
        initialStock: '50.0000',
        minimumStock: '10.0000',
        quickSlot: 8,
      },
    ];

    for (const item of items) {
      await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
    }
  });

  await page.reload();
  await expect(page.locator('.pulso-ribbon')).toBeVisible();
  await expect(page.locator('button:has-text("Alfajor Triple Dulce de Leche")')).toBeVisible();
}

async function registerBusiness(
  page: Page,
  businessName = 'Kiosco El Trébol',
  locationName = 'Casa Central',
  ownerName = 'Operador Mostrador',
  email = 'operador@kiosco.com',
  password = 'passwordSegura123!',
  seedProducts = false
) {
  await page.goto('/');

  // Wait for bootstrap verification to complete and either register or login screen to display
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

  // Wait for sales screen to load with verified business name in ribbon
  const ribbon = page.locator('.pulso-ribbon');
  await expect(ribbon).toBeVisible();
  await expect(ribbon).toContainText(businessName);

  if (seedProducts) {
    await seedDemoProducts(page);
  }
}

test.describe('Vertical Slice 1 — Auth, Identity, Tenancy & Operational POS E2E Suite', () => {
  test('Accessibility Audit (Axe WCAG AA): LoginScreen and RegisterScreen', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1:has-text("Acceso a Mostrador")')).toBeVisible();

    // 1. Audit Login Screen
    await saveScreenshot(page, 'login-mostrador-1280x720');
    const loginScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(loginScanResults.violations).toEqual([]);

    // 2. Switch to Register Screen & Audit
    await page.locator('button:has-text("Registrar mi negocio")').click();
    await expect(page.locator('h1:has-text("Registrar Negocio")')).toBeVisible();
    await saveScreenshot(page, 'registro-negocio-1280x720');

    const registerScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(registerScanResults.violations).toEqual([]);
  });

  test('Full Authentication Lifecycle: Unauthenticated -> Register -> Auto-login -> Reload -> Demo Sale -> Logout -> Protected Route -> Login error -> Valid Login', async ({
    page,
  }) => {
    // 1. Open app without session -> verifies login screen is displayed
    await page.goto('/');
    await expect(page.locator('h1:has-text("Acceso a Mostrador")')).toBeVisible();

    // 2. Register initial business
    await registerBusiness(
      page,
      'Kiosco El Trébol',
      'Casa Central',
      'Operador Mostrador',
      'operador@kiosco.com',
      'passwordSegura123!',
      true
    );

    const ribbon = page.locator('.pulso-ribbon');
    // 3. Confirm automatic entry and real data in ribbon
    await expect(ribbon).toContainText('Kiosco El Trébol');
    await expect(ribbon).toContainText('Casa Central');
    await expect(ribbon).toContainText('Sin turno abierto');
    await expect(ribbon).toContainText('Operador Mostrador (Propietario)');
    await expect(ribbon).not.toContainText('Operador (Cajero)');
    await expect(ribbon).not.toContainText('Turno Tarde #14');

    // 4. Reload page and confirm session persistence
    await page.reload();
    await expect(ribbon).toBeVisible();
    await expect(ribbon).toContainText('Kiosco El Trébol');
    await expect(ribbon).toContainText('Casa Central');

    // 5. Perform authenticated demo sale
    const productBtn = page.locator('button:has-text("Agua Mineral 500ml")');
    await productBtn.click();
    await page.locator('button:has-text("COBRAR EN EFECTIVO")').click();

    const tenderModal = page.locator('[role="dialog"][aria-label="Cobro en efectivo"]');
    await expect(tenderModal).toBeVisible();
    await tenderModal.locator('button:has-text("EXACTO")').click();
    await tenderModal.locator('button:has-text("CONFIRMAR COBRO")').click();

    const successSeal = page.locator('[role="status"]:has-text("VENTA CONFIRMADA")');
    await expect(successSeal).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(successSeal).not.toBeVisible();

    // 6. Logout
    const logoutBtn = page.locator('button:has-text("SALIR")');
    await logoutBtn.click();

    // 7. Verify redirect to login and protected route remains inaccessible
    await expect(page.locator('h1:has-text("Acceso a Mostrador")')).toBeVisible();
    await page.reload();
    await expect(page.locator('h1:has-text("Acceso a Mostrador")')).toBeVisible();

    // 8. Test invalid password login
    await page.locator('#login-email').fill('operador@kiosco.com');
    await page.locator('#login-password').fill('wrongpassword999');
    await page.locator('button:has-text("INGRESAR AL MOSTRADOR")').click();

    const errorAlert = page.locator('[role="alert"]');
    await expect(errorAlert).toBeVisible();
    await expect(errorAlert).toContainText('Credenciales inválidas');

    // 9. Login with correct password
    await page.locator('#login-password').fill('passwordSegura123!');
    await page.locator('button:has-text("INGRESAR AL MOSTRADOR")').click();

    await expect(ribbon).toBeVisible();
    await expect(ribbon).toContainText('Kiosco El Trébol');
    await expect(ribbon).toContainText('Operador Mostrador (Propietario)');
  });

  test('Multi-Tenant Isolation between two independent businesses', async ({ page, browser }) => {
    // 1. Register Business A in default context
    await registerBusiness(
      page,
      'Kiosco Alpha',
      'Sucursal Alpha',
      'Alice Propietaria',
      'alice@alpha.com',
      'superSecretPassphraseAlpha123'
    );
    const ribbonA = page.locator('.pulso-ribbon');
    await expect(ribbonA).toContainText('Kiosco Alpha');
    await expect(ribbonA).toContainText('Alice Propietaria (Propietario)');

    // 2. Register Business B in a separate browser context
    const contextB = await browser.newContext({ baseURL: 'http://localhost:4173' });
    const pageB = await contextB.newPage();
    await registerBusiness(
      pageB,
      'Kiosco Beta',
      'Sucursal Beta',
      'Bob Propietario',
      'bob@beta.com',
      'superSecretPassphraseBeta123'
    );
    const ribbonB = pageB.locator('.pulso-ribbon');
    await expect(ribbonB).toContainText('Kiosco Beta');
    await expect(ribbonB).toContainText('Bob Propietario (Propietario)');

    // 3. Verify Business A is completely unpolluted by Business B
    await expect(ribbonA).toContainText('Kiosco Alpha');
    await expect(ribbonA).not.toContainText('Kiosco Beta');

    await contextB.close();
  });

  const VIEWPORTS = [
    { width: 1024, height: 768, label: '1024x768' },
    { width: 1280, height: 720, label: '1280x720' },
    { width: 1440, height: 900, label: '1440x900' },
  ];

  for (const vp of VIEWPORTS) {
    test(`Scenario (${vp.label}): Operational Sales Flow & Multi-Viewport Responsiveness (Zero Horizontal Overflow)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await registerBusiness(
        page,
        'Kiosco El Trébol',
        'Casa Central',
        'Operador Mostrador',
        `operador-${vp.label}@kiosco.com`,
        'passwordSegura123!',
        true
      );

      const ribbon = page.locator('.pulso-ribbon');
      await expect(ribbon).toBeVisible();
      await expect(ribbon).toContainText('ONLINE');

      // Verify no horizontal overflow in the viewport
      const hasHorizontalOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(hasHorizontalOverflow).toBe(false);

      // Verify ComponentCatalog is completely removed from navigation
      await expect(page.locator('button:has-text("CATÁLOGO COMPONENTES")')).not.toBeVisible();

      // 1. Capture Estado Vacío
      await expect(page.locator('text=Esperando productos...')).toBeVisible();
      await saveScreenshot(page, `estado-1-vacio-${vp.label}`);
      if (vp.label === '1280x720') {
        await saveScreenshot(page, 'estado-1-vacio');
      }

      // 2. Dynamic Search with matches
      const searchInput = page.locator('input[aria-label="Escanear o buscar producto"]');
      await searchInput.fill('agua');
      await expect(page.locator('button:has-text("Agua Mineral 500ml")')).toBeVisible();
      await saveScreenshot(page, `busqueda-con-coincidencias-${vp.label}`);
      if (vp.label === '1280x720') {
        await saveScreenshot(page, 'busqueda-con-coincidencias');
      }

      // 3. Dynamic Search without matches
      await searchInput.fill('inexistente777');
      const notFoundStatus = page.locator(
        '[role="status"]:has-text("Producto no encontrado para \\"inexistente777\\"")'
      );
      await expect(notFoundStatus).toBeVisible();
      await saveScreenshot(page, `busqueda-sin-coincidencias-${vp.label}`);
      if (vp.label === '1280x720') {
        await saveScreenshot(page, 'busqueda-sin-coincidencias');
      }

      // 4. Clear search restores all 8 quick products
      await searchInput.fill('');
      await expect(page.locator('button:has-text("Alfajor Triple Dulce de Leche")')).toBeVisible();
      await expect(page.locator('button:has-text("Gaseosa Cola 500ml")')).toBeVisible();
      await expect(page.locator('button:has-text("Agua Mineral 500ml")')).toBeVisible();

      // 5. Numeric typing into search does NOT trigger shortcuts 1-8
      await searchInput.focus();
      await page.keyboard.type('7791234567890');
      await expect(searchInput).toHaveValue('7791234567890');
      await expect(page.locator('text=Esperando productos...')).toBeVisible();
      await searchInput.fill('');

      // 6. Arrow navigation and Enter adds item
      await searchInput.fill('caramelos');
      await expect(page.locator('button:has-text("Caramelos Ácidos x10")')).toBeVisible();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      const liveReceipt = page.locator('.live-receipt-container');
      await expect(liveReceipt).toContainText('Caramelos Ácidos x10');
      await expect(searchInput).toHaveValue('');

      // 7. Shortcut numbers 1-8 when input is not focused
      await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
      await page.keyboard.press('1');
      await expect(liveReceipt).toContainText('Alfajor Triple Dulce de Leche');

      await page.keyboard.press('2');
      await expect(liveReceipt).toContainText('Gaseosa Cola 500ml');

      // 8. Capture Estado Venta Activa
      await saveScreenshot(page, `estado-2-venta-activa-${vp.label}`);
      if (vp.label === '1280x720') {
        await saveScreenshot(page, 'estado-2-venta-activa');
      }

      // 9. Open Cash Tender Modal (MoneyKeypad)
      const cobrarBtn = page.locator('button:has-text("COBRAR EN EFECTIVO")');
      await cobrarBtn.click();

      const tenderModal = page.locator('[role="dialog"][aria-label="Cobro en efectivo"]');
      await expect(tenderModal).toBeVisible();
      await expect(tenderModal).toContainText('TOTAL A COBRAR');

      // Physical keyboard entry in MoneyKeypad
      const receivedDisplay = tenderModal.locator('[data-testid="received-amount"]');
      await page.keyboard.type('5000');
      await expect(receivedDisplay).toContainText('$ 5000');

      // Backspace correction
      await page.keyboard.press('Backspace');
      await expect(receivedDisplay).toContainText('$ 500');
      await page.keyboard.type('0');
      await expect(receivedDisplay).toContainText('$ 5000');

      // Capture Estado Cobro
      await saveScreenshot(page, `estado-3-cobro-${vp.label}`);
      if (vp.label === '1280x720') {
        await saveScreenshot(page, 'estado-3-cobro');
      }

      // Confirm payment with physical keyboard Enter
      await page.keyboard.press('Enter');

      // 10. Post-Sale Confirmation Seal
      const successSeal = page.locator('[role="status"]:has-text("VENTA CONFIRMADA")');
      await expect(successSeal).toBeVisible();

      // Capture Estado Éxito
      await saveScreenshot(page, `estado-4-exito-${vp.label}`);
      if (vp.label === '1280x720') {
        await saveScreenshot(page, 'estado-4-exito');
      }

      // Dismiss success seal with physical keyboard Enter (NUEVA VENTA)
      await page.keyboard.press('Enter');
      await expect(successSeal).not.toBeVisible();
      await expect(page.locator('text=Esperando productos...')).toBeVisible();
      await expect(searchInput).toBeFocused();

      // Verify second immediate sale works cleanly without duplication
      await page.locator('button:has-text("Agua Mineral 500ml")').click();
      await expect(liveReceipt).toContainText('Agua Mineral 500ml');
      await page.locator('button:has-text("Limpiar ticket")').click();
      await expect(page.locator('text=Esperando productos...')).toBeVisible();
    });
  }

  test('Scenario: Offline sale -> Pending queue in IndexedDB -> Reconnect -> Sync without duplicates', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await registerBusiness(
      page,
      'Kiosco Offline Test',
      'Casa Central',
      'Operador Offline',
      'offline@kiosco.com',
      'passwordSegura123!',
      true
    );

    // Toggle to offline
    const connectionBtn = page.locator('button[aria-label*="Estado de conexión"]');
    await connectionBtn.click();
    await expect(connectionBtn).toContainText('SIN CONEXIÓN');

    await saveScreenshot(page, 'estado-5-offline');

    // Make an offline sale
    await page.locator('button:has-text("Agua Mineral 500ml")').click();
    await page.locator('button:has-text("COBRAR EN EFECTIVO")').click();

    const tenderModal = page.locator('[role="dialog"][aria-label="Cobro en efectivo"]');
    await tenderModal.locator('button:has-text("EXACTO")').click();
    await tenderModal.locator('button:has-text("CONFIRMAR COBRO")').click();

    const successSeal = page.locator('[role="status"]');
    await expect(successSeal).toContainText('VENTA GUARDADA LOCAL');
    await page.keyboard.press('Enter');
    await expect(successSeal).not.toBeVisible();

    // Verify ribbon shows pending sync count badge
    const pendingBadge = page.locator('button:has-text("1 pendientes")');
    await expect(pendingBadge).toBeVisible();

    // Trigger sync
    await pendingBadge.click();

    // Reconnected and synced
    await expect(connectionBtn).toContainText('ONLINE');
    await expect(page.locator('button:has-text("pendientes")')).not.toBeVisible();
  });

  test('Scenario: Error Banner on Non-Existent Product Submission', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await registerBusiness(
      page,
      'Kiosco Error Banner',
      'Casa Central',
      'Operador Error',
      'error@kiosco.com',
      'passwordSegura123!',
      true
    );

    const searchInput = page.locator('input[aria-label="Escanear o buscar producto"]');
    await searchInput.fill('Inexistente777');
    await page.locator('button:has-text("AGREGAR")').click();

    const errorBanner = page.locator('[role="alert"]');
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toContainText('Producto no encontrado');

    await saveScreenshot(page, 'estado-7-error');
  });

  test('Scenario: Night Mode ("Azul Petróleo"), Keyboard Toggle & WCAG AA Contrast Audit', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await registerBusiness(
      page,
      'Kiosco Modo Noche',
      'Casa Central',
      'Operador Noche',
      'noche@kiosco.com',
      'passwordSegura123!',
      true
    );

    const themeBtn = page.locator('button[aria-label*="Cambiar a modo"]').first();
    await themeBtn.focus();
    await expect(themeBtn).toBeFocused();

    // Verify SVG icon exists, is decorative, and no emoji characters are present
    const iconSvg = themeBtn.locator('svg');
    await expect(iconSvg).toBeVisible();
    await expect(iconSvg).toHaveAttribute('aria-hidden', 'true');
    const btnText = await themeBtn.innerText();
    expect(btnText).not.toContain('☀');
    expect(btnText).not.toContain('🌙');

    // Trigger theme toggle with keyboard Enter
    await page.keyboard.press('Enter');

    // Verify root has data-theme="night"
    const rootDiv = page.locator('div[data-theme="night"]');
    await expect(rootDiv).toBeVisible();

    await page.locator('button:has-text("Alfajor Triple Dulce de Leche")').click();
    await page.locator('button:has-text("Gaseosa Cola 500ml")').click();

    await saveScreenshot(page, 'ventas-modo-noche');

    // Run Axe WCAG AA audit on Night Mode Sales Screen
    const nightSalesScan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(nightSalesScan.violations).toEqual([]);
  });

  test('Scenario: PWA Real Assets (Manifest & Service Worker) and Simulated Prompt Flow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });

    // 1. Fetch & Validate Real Web App Manifest from server
    const manifestResponse = await page.request.get('/manifest.webmanifest');
    expect(manifestResponse.status()).toBe(200);

    const manifest = await manifestResponse.json();
    expect(manifest.name).toBe('Pulso — Gestión de Kioscos');
    expect(manifest.short_name).toBe('Pulso');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
    expect(manifest.icons[0].sizes).toBe('192x192');
    expect(manifest.icons[1].sizes).toBe('512x512');

    // 2. Validate Real Service Worker Registration in Browser
    await registerBusiness(
      page,
      'Kiosco PWA',
      'Casa Central',
      'Operador PWA',
      'pwa@kiosco.com',
      'passwordSegura123!'
    );

    const swRegistered = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const registrations = await navigator.serviceWorker.getRegistrations();
      return registrations.length > 0;
    });
    expect(swRegistered).toBe(true);

    // 3. Dispatch synthetic beforeinstallprompt event
    // Note: Synthetic dispatch tests the application's event listener and install UI reaction,
    // as automated headless browsers do not trigger the native installation prompt autonomously.
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt');
      Object.assign(event, {
        prompt: async () => {},
        userChoice: Promise.resolve({ outcome: 'accepted' }),
      });
      window.dispatchEvent(event);
    });

    // Verify "INSTALAR APP" button is visible in ribbon
    const installBtn = page.locator('button:has-text("INSTALAR APP")');
    await expect(installBtn).toBeVisible();

    await saveScreenshot(page, 'pwa-instalacion-prompt');
  });

  test('Vertical Slice 3: Persistent Sales, Transactional Stock Decrement, Sales History & Offline Merging', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await registerBusiness(
      page,
      'Kiosco Persistencia V3',
      'Casa Central',
      'Operador V3',
      'v3@kiosco.com',
      'passwordSegura123!',
      true
    );

    const ribbon = page.locator('.pulso-ribbon');
    await expect(ribbon).toBeVisible();

    // 1. Perform online sale of 2 Alfajores
    const alfajorBtn = page.locator('button:has-text("Alfajor Triple Dulce de Leche")');
    await alfajorBtn.click();
    await alfajorBtn.click();

    await page.locator('button:has-text("COBRAR EN EFECTIVO")').click();
    const tenderModal = page.locator('[role="dialog"][aria-label="Cobro en efectivo"]');
    await expect(tenderModal).toBeVisible();
    await tenderModal.locator('button:has-text("EXACTO")').click();
    await tenderModal.locator('button:has-text("CONFIRMAR COBRO")').click();

    const successSeal = page.locator('[role="status"]:has-text("VENTA CONFIRMADA")');
    await expect(successSeal).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(successSeal).not.toBeVisible();

    // 2. Navigate to HISTORIAL tab
    const historyTab = page.locator('button:has-text("HISTORIAL")');
    await expect(historyTab).toBeVisible();
    await historyTab.click();

    await expect(page.locator('h1:has-text("Historial de Ventas")')).toBeVisible();
    const completedBadge = page.locator('span:has-text("COMPLETADA")').first();
    await expect(completedBadge).toBeVisible();
    await expect(page.locator('text=$ 2.400,00')).toBeVisible();

    // 3. Open Detail modal
    const detailBtn = page.locator('button:has-text("DETALLE")').first();
    await detailBtn.click();

    const detailModal = page.locator('[role="dialog"][aria-label="Detalle de venta"]');
    await expect(detailModal).toBeVisible();
    await expect(detailModal).toContainText('Alfajor Triple Dulce de Leche');
    await expect(detailModal).toContainText('EFECTIVO');
    await expect(detailModal).toContainText('$ 2.400,00');

    // Close modal via Escape
    await page.keyboard.press('Escape');
    await expect(detailModal).not.toBeVisible();

    // 4. Check transactional stock in PRODUCTOS tab
    const productsTab = page.locator('button:has-text("PRODUCTOS")');
    await productsTab.click();
    await expect(page.locator('h1:has-text("Productos e Inventario")')).toBeVisible();

    // 50 initial - 2 sold = 48
    const table = page.locator('table');
    await expect(table).toContainText('Alfajor Triple Dulce de Leche');
    await expect(table).toContainText('48');

    // 5. Offline sale and local pending history
    const posTab = page.locator('button:has-text("MOSTRADOR")');
    await posTab.click();

    const connectionBtn = page.locator('button[aria-label*="Estado de conexión"]');
    await connectionBtn.click();
    await expect(connectionBtn).toContainText('SIN CONEXIÓN');

    const gaseosaBtn = page.locator('button:has-text("Gaseosa Cola 500ml")');
    await gaseosaBtn.click();
    await page.locator('button:has-text("COBRAR EN EFECTIVO")').click();
    await tenderModal.locator('button:has-text("EXACTO")').click();
    await tenderModal.locator('button:has-text("CONFIRMAR COBRO")').click();

    const offlineSeal = page.locator('[role="status"]:has-text("VENTA GUARDADA LOCAL")');
    await expect(offlineSeal).toBeVisible();
    await page.keyboard.press('Enter');

    // View in HISTORIAL: shows PENDIENTE LOCAL badge
    await historyTab.click();
    await expect(page.locator('span:has-text("PENDIENTE LOCAL")').first()).toBeVisible();

    // Reconnect and sync
    await posTab.click();
    const pendingBadge = page.locator('button:has-text("1 pendientes")');
    await pendingBadge.click();
    await expect(connectionBtn).toContainText('ONLINE');

    // Return to history: now completed
    await historyTab.click();
    await expect(page.locator('span:has-text("PENDIENTE LOCAL")')).not.toBeVisible();
    await expect(page.locator('span:has-text("COMPLETADA")')).toHaveCount(2);
  });

  test('Vertical Slice 3: Keypad double-submission lock prevents duplicate sales under rapid clicks', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await registerBusiness(
      page,
      'Kiosco Lock Concurrente',
      'Casa Central',
      'Cajero Lock',
      'lock@kiosco.com',
      'passwordSegura123!',
      true
    );

    // 1. Add 1 Alfajor
    const alfajorBtn = page.locator('button:has-text("Alfajor Triple Dulce de Leche")');
    await alfajorBtn.click();

    // 2. Open Tender
    await page.locator('button:has-text("COBRAR EN EFECTIVO")').click();
    const tenderModal = page.locator('[role="dialog"][aria-label="Cobro en efectivo"]');
    await expect(tenderModal).toBeVisible();
    await tenderModal.locator('button:has-text("EXACTO")').click();

    // 3. Trigger rapid consecutive clicks on CONFIRMAR COBRO (synchronous double-click)
    const confirmBtn = tenderModal.locator('button:has-text("CONFIRMAR COBRO")');
    await confirmBtn.evaluate((btn: HTMLElement) => {
      btn.click();
      btn.click();
    });

    // 4. Verify sale confirmed once
    const successSeal = page.locator('[role="status"]:has-text("VENTA CONFIRMADA")');
    await expect(successSeal).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(successSeal).not.toBeVisible();

    // 5. Historial must contain strictly 1 sale, not 2
    const historyTab = page.locator('button:has-text("HISTORIAL")');
    await historyTab.click();
    await expect(page.locator('h1:has-text("Historial de Ventas")')).toBeVisible();
    await expect(page.locator('span:has-text("COMPLETADA")')).toHaveCount(1);
    await expect(page.getByText('1 venta', { exact: true })).toBeVisible();

    // 6. Products stock must be 49 (50 initial - 1 sold), proving no double decrement
    const productsTab = page.locator('button:has-text("PRODUCTOS")');
    await productsTab.click();
    const table = page.locator('table');
    await expect(table).toContainText('Alfajor Triple Dulce de Leche');
    await expect(table).toContainText('49');
  });
});
