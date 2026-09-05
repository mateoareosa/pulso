# Pulso — Sistema Operativo de Mostrador

Pulso es un sistema operativo de punto de venta (POS) y gestión operativa para kioscos y pequeños comercios minoristas. Diseñado bajo principios de **monolito modular**, estética funcional **"Mostrador vivo"**, arquitectura **offline-first** e **idempotencia de extremo a extremo**.

---

## 1. Requisitos Previos

- **Node.js**: `>= 20.0.0`
- **pnpm**: `>= 9.0.0`
- **Docker Desktop**: con soporte para Compose v2

---

## 2. Configuración del Entorno

Copiar las plantillas de variables de entorno:

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
```

Variables principales:

| Variable            | Descripción                          | Valor por Defecto                                                                                        |
| :------------------ | :----------------------------------- | :------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`      | Conexión PostgreSQL (desarrollo)     | `postgresql://pulso:pulso_dev_password@localhost:5432/pulso_dev?schema=public`                           |
| `TEST_DATABASE_URL` | Conexión PostgreSQL (testing/E2E)    | `postgresql://pulso:pulso_test_password@localhost:5433/pulso_test?schema=public`                         |
| `PORT`              | Puerto HTTP de la API NestJS         | `4000` (desarrollo; pruebas E2E usan puerto exclusivo `4100`)                                            |
| `SESSION_TTL_HOURS` | Duración de sesiones opacas          | `24`                                                                                                     |
| `COOKIE_SECURE`     | Flag secure para cookies             | `false` en dev local; **inviolable en producción** (`secure` siempre es `true` si `NODE_ENV=production`) |
| `ALLOWED_ORIGINS`   | Orígenes permitidos (CORS y Origin)  | `http://localhost:3000,http://localhost:4173,http://127.0.0.1:3000,...`                                  |
| `DEV_SEED_*`        | Credenciales para seed de desarrollo | `DEV_SEED_EMAIL`, `DEV_SEED_PASSWORD`, etc. (estrictamente bloqueado en prod)                            |

---

## 3. Infraestructura Docker

Pulso utiliza dos contenedores PostgreSQL independientes: uno para desarrollo persistente y otro para pruebas automatizadas (con `tmpfs` en memoria):

```bash
# Iniciar base de datos de desarrollo (puerto 5432)
docker compose up -d postgres

# Iniciar base de datos de pruebas (puerto 5433, perfil test)
docker compose --profile test up -d postgres-test

# Verificar estado de contenedores
docker compose ps
```

---

## 4. Migraciones de Base de Datos

Las migraciones son versionadas mediante Prisma (`apps/api/prisma/schema.prisma`):

```bash
# Aplicar migraciones en desarrollo
pnpm --filter @pulso/api exec prisma migrate deploy

# Generar cliente de Prisma
pnpm prisma generate

# Preparar y migrar la base de datos de testing
pnpm db:test:prepare
```

---

## 5. Creación del Primer Negocio

El alta del primer comercio y cuenta administradora se realiza de forma interactiva y atómica:

1. Iniciar la aplicación web (`pnpm dev`) y abrir `http://localhost:3000`.
2. En la pantalla inicial de bienvenida, seleccionar **"Registrar un nuevo negocio"**.
3. Completar los datos requeridos:
   - **Nombre del negocio** (ej: `Kiosco El Trébol`)
   - **Nombre de la sucursal** (ej: `Casa Central`)
   - **Nombre del propietario** (ej: `Operador Mostrador`)
   - **Correo electrónico** (ej: `operador@kiosco.com`)
   - **Contraseña** (mínimo 12 caracteres)
4. Al confirmar, el sistema ejecuta una transacción atómica que crea:
   - Usuario global (`User`) con contraseña hasheada en Argon2id.
   - Comercio (`Tenant`) con slug URL-safe único (con resolución de colisiones).
   - Sucursal inicial (`Location`).
   - Membresía administradora (`TenantMembership` con rol `OWNER`).
   - Sesión opaca persistente (`Session`) entregada en cookie `httpOnly` (`pulso_session`).

---

## 6. Ejecución de Pruebas y Calidad de Código

El monorepo cuenta con una suite completa de pruebas unitarias, de integración y E2E:

```bash
# Ejecutar todas las pruebas unitarias y de integración
pnpm test

# Ejecutar linter (ESLint)
pnpm lint

# Comprobar formato (Prettier)
pnpm format:check

# Verificación de tipos TypeScript
pnpm typecheck

# Compilación de todos los paquetes y aplicaciones
pnpm build

# Ejecutar pruebas end-to-end con Playwright
pnpm --filter @pulso/web exec playwright test
```

> **Aislamiento Seguro en E2E**: Playwright levanta la API de pruebas en un puerto exclusivo (`4100`), configurado para conectarse únicamente a `pulso_test` en el puerto 5433 con `reuseExistingServer: false`. Esto garantiza que los tests nunca toquen ni limpien la base de datos de desarrollo (`pulso_dev`).
>
> **Verificación PWA**: Las pruebas E2E validan de forma real la descarga e integridad del manifest (`/manifest.webmanifest`) y el registro del Service Worker en el navegador. La oferta de instalación en la interfaz se prueba mediante el despacho sintético del evento estándar `beforeinstallprompt`, asegurando la reactividad del UI sin depender de las heurísticas del navegador en modo headless.

---

## 7. Arquitectura de Seguridad y Sesiones

- **Sesiones Opacas Revocables**: Tokens aleatorios criptográficos de 256 bits generados en el servidor (`randomBytes(32)`). En PostgreSQL se almacena exclusivamente el hash SHA-256 (`tokenHash`). El token en texto plano nunca se persiste.
- **Transporte Seguro en Cookies**: La cookie `pulso_session` está configurada como `httpOnly: true`, `sameSite: 'lax'`, `path: '/'` y `secure`. La flag `httpOnly` impide que scripts en el cliente lean o exfiltren el token de sesión ante ataques XSS.
- **Inviolabilidad de `COOKIE_SECURE` en Producción**: En `NODE_ENV === 'production'`, el atributo `secure` es forzado incondicionalmente a `true`. La variable de entorno `COOKIE_SECURE` solo tiene efecto en development y test; ninguna configuración de entorno puede deshabilitar `Secure` en producción.
- **Defensa en Profundidad contra CSRF y Validación de Origen**: Se implementa `OriginValidationGuard` para todas las mutaciones autenticadas (`POST`, `PUT`, `PATCH`, `DELETE`). Evalúa prioritariamente la cabecera `Origin` contra `ALLOWED_ORIGINS` y, si está ausente, evalúa el origen de la cabecera `Referer`. Rechaza cabeceras `Referer` malformadas y, en producción, rechaza de inmediato (403 Forbidden) peticiones mutantes sin `Origin` ni `Referer`. Combinado con `sameSite: 'lax'`, proporciona defensa en profundidad contra ataques CSRF.
- **Argon2id**: Hasheo de contraseñas con parámetros exactos alineados a recomendaciones OWASP (`algorithm: 2` [Argon2id], memoria 19 MiB [19456 KiB], `timeCost: 2`, paralelismo 1, salida 32 bytes). Los endpoints de autenticación retornan un error genérico 401 para evitar la enumeración de cuentas.
- **Aislamiento Multi-Tenant**: Toda consulta y mutación deriva estrictamente `tenantId`, `locationId` y rol del operador a partir de la sesión validada en el backend. Los parámetros de tenant o sucursal provistos por el cliente en el cuerpo o querystrings de solicitudes autenticadas son ignorados o rechazados.
- **Rate Limiting con Memoria Acotada**: Protección con ventana deslizante en endpoints sensibles de autenticación (`/auth/register`, `/auth/login`), limitando a un máximo de 5 intentos por minuto por IP y por correo normalizado, respondiendo HTTP 429 sin filtrar la existencia de cuentas. El servicio (`RateLimiterService`) tiene un límite estricto de 10.000 entradas activas, desalojo proactivo por TTL (`unref` timer) y desalojo FIFO en desbordamiento para prevenir ataques de denegación de servicio por consumo de memoria. Está diseñado para el ámbito de despliegue de instancia única (monolito MVP inicial).
- **Recuperación de Contraseña**: La recuperación de contraseña vía email está postergada intencionalmente por diseño en esta etapa, debido a la ausencia deliberada de infraestructura de email transaccional en el entorno inicial de kioscos.

---

## 8. Documentación Adicional

- [ADR-001: Arquitectura Modular Monolítica](docs/adr/ADR-001-modular-monolith-architecture.md)
- [ADR-002: Estrategia Offline, Sincronización e Idempotencia](docs/adr/ADR-002-offline-sync-idempotency-strategy.md)
- [ADR-003: Sesiones Opacas y Seguridad de Cookies](docs/adr/ADR-003-opaque-sessions-and-cookie-security.md)
- [ADR-004: Identidad Global de Usuario y Membresías de Tenant](docs/adr/ADR-004-global-user-identity-and-tenant-memberships.md)
- [Especificación OpenAPI 3.0](docs/openapi.yaml)
- [Capacidades Offline y PWA](docs/offline-capabilities.md)
