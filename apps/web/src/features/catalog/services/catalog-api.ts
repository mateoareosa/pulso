import { apiRequest } from '../../../services/api-client';
import type {
  CategoryResponse,
  CreateCategoryCommand,
  UpdateCategoryCommand,
  ProductResponse,
  PaginatedProductsResponse,
  CreateProductCommand,
  UpdateProductCommand,
  UpdateLocationSettingsCommand,
  CreateStockAdjustmentCommand,
  StockMovementResponse,
} from '@pulso/contracts';

export const catalogApi = {
  async fetchCategories(): Promise<CategoryResponse[]> {
    return await apiRequest<CategoryResponse[]>('/api/categories');
  },

  async createCategory(dto: CreateCategoryCommand): Promise<CategoryResponse> {
    return await apiRequest<CategoryResponse>('/api/categories', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async updateCategory(id: string, dto: UpdateCategoryCommand): Promise<CategoryResponse> {
    return await apiRequest<CategoryResponse>(`/api/categories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    });
  },

  async fetchProducts(
    params: {
      q?: string;
      categoryId?: string;
      barcode?: string;
      onlyAvailable?: boolean;
      includeInactive?: boolean;
      status?: 'ALL' | 'ACTIVE' | 'INACTIVE';
      page?: number;
      limit?: number;
    } = {}
  ): Promise<PaginatedProductsResponse> {
    const searchParams = new URLSearchParams();
    if (params.q) searchParams.set('q', params.q);
    if (params.categoryId) searchParams.set('categoryId', params.categoryId);
    if (params.barcode) searchParams.set('barcode', params.barcode);
    if (params.onlyAvailable !== undefined)
      searchParams.set('onlyAvailable', String(params.onlyAvailable));
    if (params.includeInactive !== undefined)
      searchParams.set('includeInactive', String(params.includeInactive));
    if (params.status) searchParams.set('status', params.status);
    if (params.page) searchParams.set('page', String(params.page));
    if (params.limit) searchParams.set('limit', String(params.limit));

    const qs = searchParams.toString();
    const endpoint = `/api/products${qs ? `?${qs}` : ''}`;
    return await apiRequest<PaginatedProductsResponse>(endpoint);
  },

  async fetchQuickProducts(): Promise<ProductResponse[]> {
    return await apiRequest<ProductResponse[]>('/api/products/quick-slots');
  },

  async fetchProductById(id: string): Promise<ProductResponse> {
    return await apiRequest<ProductResponse>(`/api/products/${id}`);
  },

  async createProduct(dto: CreateProductCommand): Promise<ProductResponse> {
    return await apiRequest<ProductResponse>('/api/products', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async updateProduct(id: string, dto: UpdateProductCommand): Promise<ProductResponse> {
    return await apiRequest<ProductResponse>(`/api/products/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    });
  },

  async updateLocationSettings(
    id: string,
    dto: UpdateLocationSettingsCommand
  ): Promise<{
    productId: string;
    locationId: string;
    stockQuantity: string;
    minimumStock: string;
    isAvailable: boolean;
    quickSlot: number | null;
    version: number;
  }> {
    return await apiRequest(`/api/products/${id}/location-settings`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    });
  },

  async adjustStock(
    id: string,
    dto: CreateStockAdjustmentCommand
  ): Promise<{
    movement: StockMovementResponse;
    productLocation: {
      stockQuantity: string;
      version: number;
    };
  }> {
    return await apiRequest(`/api/products/${id}/stock-adjustments`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async fetchStockMovements(id: string): Promise<StockMovementResponse[]> {
    return await apiRequest<StockMovementResponse[]>(`/api/products/${id}/stock-movements`);
  },
};
