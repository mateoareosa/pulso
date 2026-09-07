import { apiRequest } from '../../../services/api-client';
import type {
  OpenCashShiftCommand,
  CloseCashShiftCommand,
  CreateCashMovementCommand,
  QueryCashShifts,
  CashShiftResponse,
  CashMovementResponse,
  PaginatedCashShiftsResponse,
} from '@pulso/contracts';

export const cashApi = {
  async fetchActiveShift(): Promise<CashShiftResponse | null> {
    const res = await apiRequest<CashShiftResponse | null>('/api/cash/active');
    return res && res.id ? res : null;
  },

  async openShift(
    dto: OpenCashShiftCommand
  ): Promise<{ success: boolean; shift: CashShiftResponse; idempotentReplay: boolean }> {
    return await apiRequest<{
      success: boolean;
      shift: CashShiftResponse;
      idempotentReplay: boolean;
    }>('/api/cash/shifts/open', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async registerCashIn(dto: CreateCashMovementCommand): Promise<{
    success: boolean;
    movement: CashMovementResponse;
    shift: CashShiftResponse;
    idempotentReplay: boolean;
  }> {
    return await apiRequest<{
      success: boolean;
      movement: CashMovementResponse;
      shift: CashShiftResponse;
      idempotentReplay: boolean;
    }>('/api/cash/movements/in', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async registerCashOut(dto: CreateCashMovementCommand): Promise<{
    success: boolean;
    movement: CashMovementResponse;
    shift: CashShiftResponse;
    idempotentReplay: boolean;
  }> {
    return await apiRequest<{
      success: boolean;
      movement: CashMovementResponse;
      shift: CashShiftResponse;
      idempotentReplay: boolean;
    }>('/api/cash/movements/out', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async closeShift(
    dto: CloseCashShiftCommand
  ): Promise<{ success: boolean; shift: CashShiftResponse; idempotentReplay: boolean }> {
    return await apiRequest<{
      success: boolean;
      shift: CashShiftResponse;
      idempotentReplay: boolean;
    }>('/api/cash/shifts/close', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async fetchShifts(params: Partial<QueryCashShifts> = {}): Promise<PaginatedCashShiftsResponse> {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set('page', String(params.page));
    if (params.limit) searchParams.set('limit', String(params.limit));
    if (params.from) searchParams.set('from', params.from);
    if (params.to) searchParams.set('to', params.to);
    if (params.status) searchParams.set('status', params.status);

    const qs = searchParams.toString();
    const endpoint = `/api/cash/shifts${qs ? `?${qs}` : ''}`;
    return await apiRequest<PaginatedCashShiftsResponse>(endpoint);
  },

  async fetchShiftById(id: string): Promise<CashShiftResponse> {
    return await apiRequest<CashShiftResponse>(`/api/cash/shifts/${encodeURIComponent(id)}`);
  },
};
