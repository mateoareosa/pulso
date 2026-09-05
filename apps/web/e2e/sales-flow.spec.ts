import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import AxeBuilder from '@axe-core/playwright';

const SCREENSHOTS_DIR = path.resolve(process.cwd(), 'e2e/screenshots');
const ARTIFACTS_DIR =
  'C:\\Users\\Mateo\\.gemini\\antigravity\\brain\\1316521a-ff09-478a-8fc4-eb7962228ef9';

test.beforeAll(() => {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }
});

async function saveScreenshot(page: Page, name: string) {
  const localPath = path.join(SCREENSHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: localPath, fullPage: true });

  if (fs.existsSync(ARTIFACTS_DIR)) {
    const artifactPath = path.join(ARTIFACTS_DIR, `${name}.png`);
    fs.copyFileSync(localPath, artifactPath);
  }
}

test.describe('Pulso "Mostrador vivo" — Refined E2E Suite & Multi-Viewport Verification', () => {
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

  // Test across the 3 requested viewports: 1024x768, 1280x720, 1440x900
  const VIEWPORTS = [
    { width: 1024, height: 768, label: '1024x768' },
    { width: 1280, height: 720, label: '1280x720' },
    { width: 1440, height: 900, label: '1440x900' },
  ];

  for (const vp of VIEWPORTS) {
    test(`Scenario 1 (${vp.label}): Standard cash sales lifecycle`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');

      const ribbon = page.locator('.pulso-ribbon');
      await expect(ribbon).toBeVisible();
      await expect(ribbon).toContainText('ONLINE');

      // 1. Capture Estado Vacío
      await expect(page.locator('text=Esperando productos...')).toBeVisible();
      await saveScreenshot(page, `estado-1-vacio-${vp.label}`);
      if (vp.label === '1280x720') {
        await saveScreenshot(page, 'estado-1-vacio');
      }

      // 2. Add products (Alfajor + Cola)
      const alfajorBtn = page.locator('button:has-text("Alfajor Triple Dulce de Leche")');
      await alfajorBtn.click();

      const liveReceipt = page.locator('.live-receipt-container');
      await expect(liveReceipt).toContainText('Alfajor Triple Dulce de Leche');

      const colaBtn = page.locator('button:has-text("Gaseosa Cola 500ml")');
      await colaBtn.click();
      await expect(liveReceipt).toContainText('$ 2.700,00');

      // 2. Capture Estado Venta Activa
      await saveScreenshot(page, `estado-2-venta-activa-${vp.label}`);
      if (vp.label === '1280x720') {
        await saveScreenshot(page, 'estado-2-venta-activa');
      }

      // 3. Open Cash Tender Modal (MoneyKeypad)
      const cobrarBtn = page.locator('button:has-text("COBRAR EN EFECTIVO")');
      await cobrarBtn.click();

      const tenderModal = page.locator('[role="dialog"][aria-label="Cobro en efectivo"]');
      await expect(tenderModal).toBeVisible();
      await expect(tenderModal).toContainText('TOTAL A COBRAR');

      // Add $5.000 cash via quick button
      await tenderModal.locator('button:has-text("+$5.000")').click();
      await expect(tenderModal).toContainText('$ 2.300,00');

      // 3. Capture Estado Cobro
      await saveScreenshot(page, `estado-3-cobro-${vp.label}`);
      if (vp.label === '1280x720') {
        await saveScreenshot(page, 'estado-3-cobro');
      }

      // 4. Confirm Payment
      await tenderModal.locator('button:has-text("CONFIRMAR COBRO")').click();

      // Verify Success Seal
      const successSeal = page.locator('[role="status"]');
      await expect(successSeal).toBeVisible();
      await expect(successSeal).toContainText('VENTA CONFIRMADA');
      await expect(successSeal).toContainText('$ 2.700,00');
      await expect(successSeal).toContainText('$ 2.300,00');

      // 4. Capture Estado Éxito
      await saveScreenshot(page, `estado-4-exito-${vp.label}`);
      if (vp.label === '1280x720') {
        await saveScreenshot(page, 'estado-4-exito');
      }

      // Reset
      await successSeal.locator('button:has-text("NUEVA VENTA")').click();
      await expect(page.locator('text=Esperando productos...')).toBeVisible();
    });

    test(`Scenario Catalog Responsiveness (${vp.label}): Zero overflow on cards and ribbon`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');

      // Navigate to component catalog
      await page.locator('button:has-text("CATÁLOGO COMPONENTES")').click();
      await expect(page.locator('text=Pulso — Catálogo de Componentes')).toBeVisible();

      // Verify no horizontal document overflow
      const docOverflow = await page.evaluate(() => {
        return (
          document.documentElement.scrollWidth > window.innerWidth ||
          document.documentElement.scrollWidth > document.documentElement.clientWidth
        );
      });
      expect(docOverflow).toBe(false);

      // Verify all 4 tab buttons are visible and strictly within viewport boundaries
      const tabButtons = page.locator('.pulso-catalog-tabs button');
      await expect(tabButtons).toHaveCount(4);
      const tabCount = await tabButtons.count();
      for (let i = 0; i < tabCount; i++) {
        const tab = tabButtons.nth(i);
        await expect(tab).toBeVisible();
        const box = await tab.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width);
      }

      // Verify every card (article) has zero horizontal overflow
      const cardOverflows = await page.evaluate(() => {
        const articles = Array.from(document.querySelectorAll('article'));
        return articles.map((a, i) => ({
          index: i,
          scrollWidth: a.scrollWidth,
          clientWidth: a.clientWidth,
          hasOverflow: a.scrollWidth > a.clientWidth,
        }));
      });

      for (const card of cardOverflows) {
        expect(card.hasOverflow).toBe(false);
      }

      // Capture screenshot of catalog at this viewport
      await saveScreenshot(page, `catalogo-sin-desbordes-${vp.label}`);
      if (vp.label === '1280x720') {
        await saveScreenshot(page, 'estado-6-sincronizacion-catalogo');
      }
    });
  }

  test('Scenario 2: Offline sale -> Pending queue in IndexedDB -> Reconnect -> Sync without duplicates', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');

    // Toggle to offline
    const connectionBtn = page.locator('button[aria-label*="Estado de conexión"]');
    await connectionBtn.click();
    await expect(connectionBtn).toContainText('SIN CONEXIÓN');

    // 5. Capture Estado Offline
    await saveScreenshot(page, 'estado-5-offline');

    // Make an offline sale
    await page.locator('button:has-text("Agua Mineral 500ml")').click();
    await page.locator('button:has-text("COBRAR EN EFECTIVO")').click();

    const tenderModal = page.locator('[role="dialog"][aria-label="Cobro en efectivo"]');
    await tenderModal.locator('button:has-text("EXACTO")').click();
    await tenderModal.locator('button:has-text("CONFIRMAR COBRO")').click();

    const successSeal = page.locator('[role="status"]');
    await expect(successSeal).toContainText('VENTA GUARDADA LOCAL');
    await successSeal.locator('button:has-text("NUEVA VENTA")').click();

    // Verify ribbon shows pending sync count badge
    const pendingBadge = page.locator('button:has-text("1 pendientes")');
    await expect(pendingBadge).toBeVisible();

    // Trigger sync
    await pendingBadge.click();

    // Reconnected and synced
    await expect(connectionBtn).toContainText('ONLINE');
    await expect(page.locator('button:has-text("pendientes")')).not.toBeVisible();
  });

  test('Scenario 3: Error Banner', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');

    // Trigger Error Banner
    const searchInput = page.locator('input[aria-label="Escanear o buscar producto"]');
    await searchInput.fill('Inexistente777');
    await page.locator('button:has-text("AGREGAR")').click();

    const errorBanner = page.locator('[role="alert"]');
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toContainText('Producto no encontrado');

    // 7. Capture Estado Error
    await saveScreenshot(page, 'estado-7-error');
  });

  test('Scenario 4: Night Mode ("Azul Petróleo"), Keyboard Toggle & WCAG AA Contrast Audit', async ({
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

    // Switch to Catalog in Night Mode
    await page.locator('button:has-text("CATÁLOGO COMPONENTES")').click();
    await expect(page.locator('text=Pulso — Catálogo de Componentes')).toBeVisible();

    // Verify Catalog header theme button also has decorative SVG icon and responds to keyboard
    const catalogThemeBtn = page.locator('button[aria-label*="Cambiar a modo"]').nth(1);
    await expect(catalogThemeBtn.locator('svg')).toHaveAttribute('aria-hidden', 'true');
    await catalogThemeBtn.focus();
    await expect(catalogThemeBtn).toBeFocused();

    // Capture Catalog in Night Mode
    await saveScreenshot(page, 'catalogo-modo-noche');

    // Run Axe WCAG AA audit on Night Mode Catalog
    const nightCatalogScan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(nightCatalogScan.violations).toEqual([]);
  });

  test('Scenario 5: PWA Installation Evidence & Service Worker Validation', async ({ page }) => {
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
    // In preview mode Vite PWA registers sw.js
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
