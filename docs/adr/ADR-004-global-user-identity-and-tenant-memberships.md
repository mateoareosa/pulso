# ADR-004: Global User Identity and Tenant Memberships

## Status

Accepted

## Context

Pulso is designed to support retail merchants and kiosks ranging from single-counter family businesses to multi-branch operations and franchise networks. When designing the identity and authorization model, two main paradigms were evaluated:

1. **Siloed Tenant Users**: Users exist strictly inside a single tenant table (`TenantUser`), with email addresses scoped only per tenant.
2. **Global Identity with Tenant Memberships**: A central `User` identity decoupled from businesses, where authorization is granted via explicit `TenantMembership` records.

In retail operations, franchise managers, accountants, and retail operators often oversee or work shifts across multiple legal entities or stores. Duplicating identities per tenant causes credential fragmentation, synchronization friction, and prevents cross-store identity verification.

## Decision

We adopted **Global User Identity with Explicit Tenant Memberships and Scoped Operational Sessions**:

### 1. Data Model

- **`User` (Global Identity)**:
  - Unique normalized email (`email` with unique constraint, lowercased and trimmed).
  - Argon2id password hash.
  - Global status (`ACTIVE`, `DISABLED`).
- **`Tenant` (Commerce / Organization)**:
  - Unique, URL-safe slug (`slug`).
  - Name and active status.
- **`TenantMembership` (Relational Bridge & Authorization)**:
  - Composite unique key: `[tenantId, userId]`.
  - Role: `OWNER` (full operational & business administration), `MANAGER` (branch & staff operations), `CASHIER` (point-of-sale terminal execution).
  - Status: `ACTIVE` or `DISABLED` (allows revoking access to a specific business without affecting the user's global credentials or memberships in other stores).
- **`Location` (Physical Branch)**:
  - Belongs strictly to a `Tenant` (`tenantId`).
  - Every tenant receives a default initial location during registration.
- **`Session` (Operational Terminal Context)**:
  - Bound to `userId`, `tenantId`, and `locationId`.
  - While a user may hold memberships across multiple businesses, an active session operates within exactly one resolved tenant and branch context.
  - Multi-tenant isolation at the API level is enforced by extracting `tenantId` directly from the authenticated session, never trusting client parameters.

## Consequences

### Positive

- **Clean Access Delegation**: A business owner can invite or assign a cashier or manager to their tenant without creating new user accounts.
- **Immediate Revocation**: Disabling a `TenantMembership` instantly blocks that user from accessing the business without touching other stores.
- **Strict Multi-Tenant Safety**: The application layer and database queries always isolate data by `tenantId` extracted from the cryptographically verified session.

### Negative / Mitigations

- **Registration Complexity**: Creating a new business requires an atomic interactive transaction creating `User`, `Tenant`, `Location`, and `TenantMembership` simultaneously. This is mitigated by wrapping the registration flow in Prisma's `$transaction`.
