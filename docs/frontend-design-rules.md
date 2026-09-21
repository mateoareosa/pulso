# Reglas de diseño Pulso

Guía obligatoria para agentes de UX/UI y frontend. Pulso es un **mostrador vivo**: operativo, táctil y legible; no una plantilla SaaS genérica.

## Sistema visual (fuente única)

- Importar y extender los tokens de `packages/ui/src/tokens/tokens.css`; en web ya se cargan desde `apps/web/src/styles/index.css`.
- Usar nombres semánticos existentes: `--color-surface`, `--color-surface-raised`, `--color-surface-sunken`, `--color-ticket`, `--color-ink`, `--color-ink-muted`, `--color-border`, `--color-border-bold`, `--color-pulse-*`, `--color-amber-*`, `--color-tomato-*`, `--color-overlay`.
- Verde Pulse (`--color-pulse-*`) queda reservado para acción primaria, selección activa y éxito. Ámbar comunica advertencia; tomate, peligro/anulación.
- Mantener bordes nítidos: `--radius-xs/sm/md` (1–2px), `--shadow-key`, `--shadow-receipt`, `--shadow-modal`. No introducir grandes radios ni sombras difusas.
- Respetar tema `[data-theme='night']`: nunca fijar colores que rompan sus tokens.

## Tipografía y datos

- `--font-sans` = Archivo para interfaz; `--font-mono` = IBM Plex Mono para códigos, atajos, timestamps y dinero. Números monetarios/códigos usan `.font-tabular`.
- Usar escala `--text-xs` a `--text-3xl`; cuerpo operativo mínimo 14px (`--text-sm`), auxiliar mínimo 12px (`--text-xs`). Jerarquía por peso, contraste y escala; no por adornos.

## Componentes y overlays

- Reutilizar `.pulso-button` con variante `--sm|--md|--lg` y `--primary|--secondary|--danger|--ghost`; no crear botones visualmente paralelos.
- Reutilizar `.pulso-input`, `.pulso-select` y `.pulso-panel` antes de escribir estilos locales.
- Todo modal usa `.pulso-overlay` o `background: var(--color-overlay)`: overlay translúcido, nunca negro opaco. Debe tener `role="dialog"`, `aria-modal`, título asociado, cierre por Escape y click fuera cuando sea seguro.
- Mantener foco visible global (`:focus-visible`, `--color-pulse-focus`), foco inicial razonable y retorno de foco al cerrar.

## Responsive y accesibilidad

- Diseñar primero el flujo operativo y probar móvil (incluido ≤560px): tablas permiten scroll horizontal o reflujo explícito; acciones no se cortan; modal puede anclarse abajo a ancho completo.
- Controles táctiles: mínimo ~38–40px de alto; no depender solo de hover, color o iconos.
- Labels asociados, `aria-label` solo cuando no exista texto visible, errores con `role="alert"`, estados con texto y contraste suficiente.
- Respetar `prefers-reduced-motion: reduce`; animar solo transform/opacity y usando `--duration-*`.

## CSS y ownership

- No inline styles para decisiones visuales salvo valores dinámicos inevitables (p. ej. z-index controlado); no crear divergencias de tokens, botones o overlays.
- UX/UI define intención, jerarquía, estados, copy, responsive y criterios de accesibilidad.
- Frontend implementa esa intención con tokens/clases compartidas, semántica, comportamiento, tests y verificación en tema claro/`night`; no redefine la dirección visual unilateralmente.

## Checklist antes de entregar

- [ ] Tokens/clases reales usados; sin hex, radios, sombras o fuentes ad hoc.
- [ ] Jerarquía Pulso visible: Archivo + IBM Plex Mono, bordes crisp, verde solo para acción/éxito.
- [ ] Modal translúcido y accesible (foco, Escape, click fuera seguro, título/labels).
- [ ] Estados default/hover/focus/disabled/error/empty cubiertos.
- [ ] Móvil ≤560px y escritorio verificados; sin overflow accidental.
- [ ] Contraste, teclado y reduced motion verificados.
- [ ] Tests/typecheck relevantes ejecutados; `git diff --check` limpio.
