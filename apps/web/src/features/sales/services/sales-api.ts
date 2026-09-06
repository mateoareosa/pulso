import { apiRequest } from '../../../services/api-client';
import type {
  CreateSaleCommand,
  ProcessSaleResponse,
  PaginatedSalesResponse,
  SaleResponse,
  SyncBatch,
  SyncBatchResponse,
  SyncBatchResult,
} from '@pulso/contracts';

export type { SyncBatchResponse, SyncBatchResult };

export const salesApi = {
  async createSale(dto: CreateSaleCommand): Promise<ProcessSaleResponse> {
    return await apiRequest<ProcessSaleResponse>('/api/sales', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async fetchSales(
    params: {
      page?: number;
      limit?: number;
      from?: string;
      to?: string;
      search?: string;
    } = {}
  ): Promise<PaginatedSalesResponse> {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set('page', String(params.page));
    if (params.limit) searchParams.set('limit', String(params.limit));
    if (params.from) searchParams.set('from', params.from);
    if (params.to) searchParams.set('to', params.to);
    if (params.search) searchParams.set('search', params.search);

    const qs = searchParams.toString();
    const endpoint = `/api/sales${qs ? `?${qs}` : ''}`;
    return await apiRequest<PaginatedSalesResponse>(endpoint);
  },

  async fetchSaleById(id: string): Promise<SaleResponse> {
    return await apiRequest<SaleResponse>(`/api/sales/${encodeURIComponent(id)}`);
  },

  async syncBatch(batch: SyncBatch): Promise<SyncBatchResponse> {
    return await apiRequest<SyncBatchResponse>('/api/sync/batch', {
      method: 'POST',
      body: JSON.stringify(batch),
    });
  },
};
