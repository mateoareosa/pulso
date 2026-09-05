import { z } from 'zod';

export const MembershipRoleSchema = z.enum(['OWNER', 'MANAGER', 'CASHIER']);
export type MembershipRole = z.infer<typeof MembershipRoleSchema>;

export const UserStatusSchema = z.enum(['ACTIVE', 'DISABLED']);
export type UserStatus = z.infer<typeof UserStatusSchema>;

export const MembershipStatusSchema = z.enum(['ACTIVE', 'DISABLED']);
export type MembershipStatus = z.infer<typeof MembershipStatusSchema>;

export const RegisterInputSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(2, 'El nombre del negocio debe tener al menos 2 caracteres')
    .max(100, 'El nombre del negocio no puede superar los 100 caracteres'),
  locationName: z
    .string()
    .trim()
    .min(2, 'El nombre de la sucursal debe tener al menos 2 caracteres')
    .max(100, 'El nombre de la sucursal no puede superar los 100 caracteres'),
  ownerName: z
    .string()
    .trim()
    .min(2, 'El nombre del propietario debe tener al menos 2 caracteres')
    .max(100, 'El nombre del propietario no puede superar los 100 caracteres'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('El formato del correo electrónico es inválido')
    .max(255, 'El correo no puede superar los 255 caracteres'),
  password: z
    .string()
    .min(12, 'La contraseña debe tener al menos 12 caracteres')
    .max(128, 'La contraseña no puede superar los 128 caracteres'),
});

export type RegisterInput = z.infer<typeof RegisterInputSchema>;

export const LoginInputSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('El formato del correo electrónico es inválido')
    .max(255),
  password: z
    .string()
    .min(1, 'La contraseña es requerida')
    .max(128, 'La contraseña no puede superar los 128 caracteres'),
});

export type LoginInput = z.infer<typeof LoginInputSchema>;

export const SafeUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
});

export type SafeUser = z.infer<typeof SafeUserSchema>;

export const SafeTenantSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
});

export type SafeTenant = z.infer<typeof SafeTenantSchema>;

export const SafeLocationSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
});

export type SafeLocationSummary = z.infer<typeof SafeLocationSummarySchema>;

export const CurrentUserResponseSchema = z.object({
  user: SafeUserSchema,
  tenant: SafeTenantSchema,
  location: SafeLocationSummarySchema,
  role: MembershipRoleSchema,
  expiresAt: z.string(),
});

export type CurrentUserResponse = z.infer<typeof CurrentUserResponseSchema>;

export const RegisterResponseSchema = CurrentUserResponseSchema;
export type RegisterResponse = z.infer<typeof RegisterResponseSchema>;

export const LoginResponseSchema = CurrentUserResponseSchema;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const LocationResponseSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string(),
  address: z.string().nullable().optional(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type LocationResponse = z.infer<typeof LocationResponseSchema>;

export const LocationListResponseSchema = z.array(LocationResponseSchema);
export type LocationListResponse = z.infer<typeof LocationListResponseSchema>;

export const CreateLocationInputSchema = z
  .object({
    name: z
      .string({ required_error: 'El nombre de la sucursal es requerido' })
      .trim()
      .min(2, 'El nombre de la sucursal debe tener al menos 2 caracteres')
      .max(100, 'El nombre de la sucursal no puede superar los 100 caracteres'),
    address: z
      .string()
      .trim()
      .max(255, 'La dirección no puede superar los 255 caracteres')
      .optional(),
  })
  .strict();

export type CreateLocationInput = z.infer<typeof CreateLocationInputSchema>;
