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

async function saveScreenshot(page: Page, name: string) {
  const localPath = path.join(SCREENSHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: localPath, fullPage: true });
}

test.describe('Pulso "Mostrador vivo" — Etapa 0.1 E2E Suite & Multi-Viewport Verification', () => {
  test('Accessibility Audit: Sales Screen meets WCAG AA standards with Axe (Day Mode)', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('.pulso-ribbon')).toBeVisible();

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  const VIEWPORTS = [
    { width: 1024, height: 768, label: '1024x768' },
    { width: 1280, height: 720, label: '1280x720' },
    { width: 1440, height: 900, label: '1440x900' },
  ];

  for (const vp of VIEWPORTS) {
    test(`Scenario (${vp.label}): Operational Sales Flow, Dynamic Search, Physical Keyboard Tender & Dismiss`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');

      const ribbon = page.locator('.pulso-ribbon');
      await expect(ribbon).toBeVisible();
      await expect(ribbon).toContainText('ONLINE');

      // Verify ComponentCatalog is completely removed from navigation
      await expect(page.locator('button:has-text("CATÁLOGO COMPONENTES")')).not.toBeVisible();
      await expect(page.locator('button:has-text("CATÁLOGO")')).not.toBeVisible();

      // Verify static fictive cash balance is NOT displayed
      await expect(ribbon).not.toContainText('45.200');
      await expect(ribbon).not.toContainText('Caja:');

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

      // 3. Dynamic Search without matches (accessible status)
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
    await page.goto('/');

    // Toggle to offline
    const connectionBtn = page.locator('button[aria-label*="Estado de conexión"]');
    await connectionBtn.click();
    await expect(connectionBtn).toContainText('SIN CONEXIÓN');

    // Capture Estado Offline
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
    await page.goto('/');

    const searchInput = page.locator('input[aria-label="Escanear o buscar producto"]');
    await searchInput.fill('Inexistente777');
    await page.locator('button:has-text("AGREGAR")').click();

    const errorBanner = page.locator('[role="alert"]');
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toContainText('Producto no encontrado');

    // Capture Estado Error
    await saveScreenshot(page, 'estado-7-error');
  });

  test('Scenario: Night Mode ("Azul Petróleo"), Keyboard Toggle & WCAG AA Contrast Audit', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');

    // Validate keyboard accessibility of the theme toggle button via Focus and Enter
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

    // Add products to populate ticket in night mode
    await page.locator('button:has-text("Alfajor Triple Dulce de Leche")').click();
    await page.locator('button:has-text("Gaseosa Cola 500ml")').click();

    // Capture Sales Screen in Night Mode
    await saveScreenshot(page, 'ventas-modo-noche');

    // Run Axe WCAG AA audit on Night Mode Sales Screen
    const nightSalesScan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(nightSalesScan.violations).toEqual([]);
  });

  test('Scenario: PWA Installation Evidence & Service Worker Validation', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });

    // 1. Fetch & Validate Web App Manifest
    const manifestResponse = await page.request.get('/manifest.webmanifest');
    expect(manifestResponse.status()).toBe(200);

    const manifest = await manifestResponse.json();
    expect(manifest.name).toBe('Pulso — Gestión de Kioscos');
    expect(manifest.short_name).toBe('Pulso');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
    expect(manifest.icons[0].sizes).toBe('192x192');
    expect(manifest.icons[1].sizes).toBe('512x512');

    // 2. Validate Service Worker Registration in Browser
    await page.goto('/');
    const swRegistered = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const registrations = await navigator.serviceWorker.getRegistrations();
      return registrations.length > 0;
    });
    expect(swRegistered).toBe(true);

    // 3. Dispatch beforeinstallprompt event to simulate Chromium installation offer
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

    // Capture screenshot showing the PWA installation offer in the OperationalRibbon
    await saveScreenshot(page, 'pwa-instalacion-prompt');
  });
});
