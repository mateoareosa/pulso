import { apiRequest } from '../../../services/api-client';
import type { CreateEmployeeInvitationInput, EmployeeMutationInput, EmployeeResponse, EmployeeVersionInput } from '@pulso/contracts';

export const employeesApi = {
  list: () => apiRequest<EmployeeResponse[]>('/api/employees'),
  invite: (input: CreateEmployeeInvitationInput) => apiRequest<{ employee: EmployeeResponse; action: { url: string; expiresAt: string } }>('/api/employees/invitations', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: EmployeeMutationInput) => apiRequest<EmployeeResponse>(`/api/employees/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  resend: (id: string, input: EmployeeVersionInput) => apiRequest(`/api/employees/invitations/${id}/resend`, { method: 'POST', body: JSON.stringify(input) }),
  cancel: (id: string, input: EmployeeVersionInput) => apiRequest(`/api/employees/invitations/${id}/cancel`, { method: 'POST', body: JSON.stringify(input) }),
  resetPassword: (id: string, input: EmployeeVersionInput) => apiRequest(`/api/employees/${id}/password-reset`, { method: 'POST', body: JSON.stringify(input) }),
  revokeSessions: (id: string, input: EmployeeVersionInput) => apiRequest(`/api/employees/${id}/revoke-sessions`, { method: 'POST', body: JSON.stringify(input) }),
};
