import { z } from 'zod';
import { MembershipRoleSchema } from '../auth/auth.schema.js';

const IdentifierSchema = z.string().trim().min(1).max(191);
const LocationIdsSchema = z.array(IdentifierSchema).max(100);
const EmployeeMutableStatusSchema = z.enum(['ACTIVE', 'DISABLED']);

export const CreateEmployeeInvitationInputSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(255),
    name: z.string().trim().min(2).max(100),
    role: MembershipRoleSchema,
    locationIds: LocationIdsSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.locationIds).size !== value.locationIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['locationIds'],
        message: 'Las sucursales no pueden repetirse',
      });
    }
    if (value.role !== 'OWNER' && value.locationIds.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['locationIds'],
        message: 'Los empleados no propietarios requieren al menos una sucursal',
      });
    }
  });
export type CreateEmployeeInvitationInput = z.infer<
  typeof CreateEmployeeInvitationInputSchema
>;

export const EmployeeMutationInputSchema = z
  .object({
    version: z.number().int().positive(),
    role: MembershipRoleSchema,
    status: EmployeeMutableStatusSchema,
    locationIds: LocationIdsSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.locationIds).size !== value.locationIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['locationIds'],
        message: 'Las sucursales no pueden repetirse',
      });
    }
    if (value.role !== 'OWNER' && value.status === 'ACTIVE' && value.locationIds.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['locationIds'],
        message: 'Los empleados activos no propietarios requieren al menos una sucursal',
      });
    }
  });
export type EmployeeMutationInput = z.infer<typeof EmployeeMutationInputSchema>;

export const EmployeeResponseSchema = z
  .object({
    id: IdentifierSchema,
    userId: IdentifierSchema,
    email: z.string().email(),
    name: z.string(),
    role: MembershipRoleSchema,
    status: z.enum(['INVITED', 'ACTIVE', 'DISABLED']),
    version: z.number().int().positive(),
    locationIds: LocationIdsSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type EmployeeResponse = z.infer<typeof EmployeeResponseSchema>;

export const EmployeeListResponseSchema = z.array(EmployeeResponseSchema);
export type EmployeeListResponse = z.infer<typeof EmployeeListResponseSchema>;

export const EmployeeVersionInputSchema = z.object({ version: z.number().int().positive() }).strict();
export type EmployeeVersionInput = z.infer<typeof EmployeeVersionInputSchema>;

export const ManualActionLinkResponseSchema = z
  .object({
    url: z
      .string()
      .url()
      .refine((value) => {
        const parsed = new URL(value);
        return (
          (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
          parsed.username === '' &&
          parsed.password === ''
        );
      }, 'La URL de acción es inválida'),
    expiresAt: z.string().datetime(),
  })
  .strict();
export type ManualActionLinkResponse = z.infer<typeof ManualActionLinkResponseSchema>;
