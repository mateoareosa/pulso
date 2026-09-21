import { apiRequest } from '../../../services/api-client';
import type {
  CreateSupplierCommand,
  UpdateSupplierCommand,
  QuerySuppliers,
  SupplierResponse,
  PaginatedSuppliersResponse,
  CreatePurchaseDraftCommand,
  UpdatePurchaseDraftCommand,
  ReceivePurchaseCommand,
  CancelPurchaseCommand,
  QueryPurchases,
  PurchaseDetailResponse,
  PaginatedPurchasesResponse,
} from '@pulso/contracts';

export const purchasesApi = {
  // Suppliers
  async fetchSuppliers(params: Partial<QuerySuppliers> = {}): Promise<PaginatedSuppliersResponse> {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set('page', String(params.page));
    if (params.limit) searchParams.set('limit', String(params.limit));
    if (params.search) searchParams.set('search', params.search);
    if (params.isActive !== undefined) searchParams.set('isActive', String(params.isActive));

    const qs = searchParams.toString();
    return await apiRequest<PaginatedSuppliersResponse>(`/api/suppliers${qs ? `?${qs}` : ''}`);
  },

  async createSupplier(dto: CreateSupplierCommand): Promise<SupplierResponse> {
    return await apiRequest<SupplierResponse>('/api/suppliers', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async updateSupplier(id: string, dto: UpdateSupplierCommand): Promise<SupplierResponse> {
    return await apiRequest<SupplierResponse>(`/api/suppliers/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
  },

  async toggleSupplierStatus(id: string, isActive: boolean): Promise<SupplierResponse> {
    return await apiRequest<SupplierResponse>(`/api/suppliers/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    });
  },

  // Purchases
  async fetchPurchases(params: Partial<QueryPurchases> = {}): Promise<PaginatedPurchasesResponse> {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set('page', String(params.page));
    if (params.limit) searchParams.set('limit', String(params.limit));
    if (params.status) searchParams.set('status', params.status);
    if (params.supplierId) searchParams.set('supplierId', params.supplierId);
    if (params.from) searchParams.set('from', params.from);
    if (params.to) searchParams.set('to', params.to);
    if (params.search) searchParams.set('search', params.search);

    const qs = searchParams.toString();
    return await apiRequest<PaginatedPurchasesResponse>(`/api/purchases${qs ? `?${qs}` : ''}`);
  },

  async fetchPurchaseById(id: string): Promise<PurchaseDetailResponse> {
    return await apiRequest<PurchaseDetailResponse>(`/api/purchases/${encodeURIComponent(id)}`);
  },

  async createDraft(dto: CreatePurchaseDraftCommand): Promise<PurchaseDetailResponse> {
    return await apiRequest<PurchaseDetailResponse>('/api/purchases', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async updateDraft(
    id: string,
    dto: UpdatePurchaseDraftCommand & { version: number }
  ): Promise<PurchaseDetailResponse> {
    const { version, ...body } = dto;
    return await apiRequest<PurchaseDetailResponse>(`/api/purchases/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'If-Match': String(version) },
      body: JSON.stringify(body),
    });
  },

  async receivePurchase(
    id: string,
    dto: ReceivePurchaseCommand
  ): Promise<{ success: boolean; purchase: PurchaseDetailResponse; idempotentReplay: boolean }> {
    return await apiRequest<{
      success: boolean;
      purchase: PurchaseDetailResponse;
      idempotentReplay: boolean;
    }>(`/api/purchases/${encodeURIComponent(id)}/receive`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async cancelPurchase(id: string, dto: CancelPurchaseCommand): Promise<PurchaseDetailResponse> {
    return await apiRequest<PurchaseDetailResponse>(
      `/api/purchases/${encodeURIComponent(id)}/cancel`,
      {
        method: 'POST',
        body: JSON.stringify(dto),
      }
    );
  },
};
