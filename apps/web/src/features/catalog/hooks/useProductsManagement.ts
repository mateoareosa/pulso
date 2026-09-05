import { useState, useEffect, useCallback } from 'react';
import { useCatalogStore, CatalogProductItem } from '../store/catalog.store';
import { useAuth } from '../../auth/AuthContext';
import { catalogApi } from '../services/catalog-api';
import { normalizeSearchText } from '../../sync/offline-db';
import type { StockMovementResponse, InventoryMovementType } from '@pulso/contracts';

export function useProductsManagement() {
  const { session } = useAuth();
  const {
    products,
    quickProducts,
    categories,
    total,
    page,
    limit,
    totalPages,
    statusFilter,
    isLoading,
    error,
    loadCatalog,
    loadCategories,
    createProduct,
    updateProduct,
    updateLocationSettings,
    adjustStock,
    createCategory,
    setStatusFilter,
    setPage,
  } = useCatalogStore();

  const [searchFilter, setSearchFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  // Modals state
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<CatalogProductItem | null>(null);

  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [adjustingProduct, setAdjustingProduct] = useState<CatalogProductItem | null>(null);

  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyProduct, setHistoryProduct] = useState<CatalogProductItem | null>(null);
  const [movements, setMovements] = useState<StockMovementResponse[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  // Form states
  const [formName, setFormName] = useState('');
  const [formCategoryId, setFormCategoryId] = useState('');
  const [formBarcode, setFormBarcode] = useState('');
  const [formSku, setFormSku] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formCost, setFormCost] = useState('');
  const [formInitialStock, setFormInitialStock] = useState('0');
  const [formMinStock, setFormMinStock] = useState('0');
  const [formQuickSlot, setFormQuickSlot] = useState<string>('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formIsAvailable, setFormIsAvailable] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Quick Category creation
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Stock Adjust Form
  const [adjustType, setAdjustType] = useState<InventoryMovementType>('ADJUSTMENT_IN');
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustError, setAdjustError] = useState<string | null>(null);

  const refreshCatalog = useCallback(
    async (targetPage = page, targetStatus = statusFilter) => {
      if (session?.tenant?.id && session?.location?.id) {
        await loadCatalog(session.tenant.id, session.location.id, {
          page: targetPage,
          limit,
          status: targetStatus,
          q: searchFilter.trim() || undefined,
          categoryId: categoryFilter !== 'ALL' ? categoryFilter : undefined,
        });
      }
    },
    [
      session?.tenant?.id,
      session?.location?.id,
      loadCatalog,
      page,
      limit,
      statusFilter,
      searchFilter,
      categoryFilter,
    ]
  );

  useEffect(() => {
    if (!session?.tenant?.id || !session?.location?.id) return;
    loadCategories(session.tenant.id, session.location.id);
  }, [session?.tenant?.id, session?.location?.id, loadCategories]);

  useEffect(() => {
    if (!session?.tenant?.id || !session?.location?.id) return;
    const timer = setTimeout(() => {
      loadCatalog(session.tenant.id, session.location.id, {
        page: 1,
        limit,
        status: statusFilter,
        q: searchFilter.trim() || undefined,
        categoryId: categoryFilter !== 'ALL' ? categoryFilter : undefined,
      });
    }, 150);

    return () => clearTimeout(timer);
  }, [
    session?.tenant?.id,
    session?.location?.id,
    searchFilter,
    categoryFilter,
    statusFilter,
    limit,
    loadCatalog,
  ]);

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingProduct(null);
    setFormName('');
    setFormCategoryId('');
    setFormBarcode('');
    setFormSku('');
    setFormPrice('');
    setFormCost('');
    setFormInitialStock('0');
    setFormMinStock('0');
    setFormQuickSlot('');
    setFormIsActive(true);
    setFormIsAvailable(true);
    setFormError(null);
    setIsProductModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (prod: CatalogProductItem) => {
    setEditingProduct(prod);
    setFormName(prod.name);
    setFormCategoryId(prod.categoryId || '');
    setFormBarcode(prod.barcode || '');
    setFormSku(prod.sku || '');
    setFormPrice((prod.salePriceCents / 100).toFixed(2));
    setFormCost(prod.costPriceCents ? (prod.costPriceCents / 100).toFixed(2) : '');
    setFormInitialStock(prod.stockQuantity);
    setFormMinStock(prod.minimumStock);
    setFormQuickSlot(prod.quickSlot ? String(prod.quickSlot) : '');
    setFormIsActive(prod.isActive);
    setFormIsAvailable(prod.isAvailable);
    setFormError(null);
    setIsProductModalOpen(true);
  };

  // Open Adjust Modal
  const handleOpenAdjust = (prod: CatalogProductItem) => {
    setAdjustingProduct(prod);
    setAdjustType('ADJUSTMENT_IN');
    setAdjustQty('');
    setAdjustReason('');
    setAdjustError(null);
    setIsAdjustModalOpen(true);
  };

  // Open History Modal
  const handleOpenHistory = async (prod: CatalogProductItem) => {
    setHistoryProduct(prod);
    setIsHistoryModalOpen(true);
    setIsHistoryLoading(true);
    try {
      const data = await catalogApi.fetchStockMovements(prod.id);
      setMovements(data);
    } catch {
      setMovements([]);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  // Submit Product Form
  const handleSubmitProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.tenant?.id || !session?.location?.id) return;

    setFormError(null);
    setIsSubmitting(true);

    const priceCents = Math.round(parseFloat(formPrice || '0') * 100);
    const costCents = formCost ? Math.round(parseFloat(formCost) * 100) : null;
    const slot = formQuickSlot ? parseInt(formQuickSlot, 10) : null;

    try {
      if (editingProduct) {
        await updateProduct(session.tenant.id, session.location.id, editingProduct.id, {
          name: formName,
          categoryId: formCategoryId || null,
          barcode: formBarcode || null,
          sku: formSku || null,
          salePriceCents: priceCents,
          costPriceCents: costCents,
          isActive: formIsActive,
        });

        await updateLocationSettings(session.tenant.id, session.location.id, editingProduct.id, {
          quickSlot: slot,
          minimumStock: formMinStock || '0.0000',
          isAvailable: formIsAvailable,
        });
      } else {
        await createProduct(session.tenant.id, session.location.id, {
          name: formName,
          categoryId: formCategoryId || null,
          barcode: formBarcode || null,
          sku: formSku || null,
          salePriceCents: priceCents,
          costPriceCents: costCents,
          initialStock: formInitialStock || '0.0000',
          minimumStock: formMinStock || '0.0000',
          quickSlot: slot,
          isAvailable: formIsAvailable,
        });
      }

      setIsProductModalOpen(false);
    } catch (err: unknown) {
      setFormError((err as Error).message || 'Error al guardar el producto.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Stock Adjustment with CAS Concurrency Protection (Point 7)
  const handleSubmitAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.tenant?.id || !session?.location?.id || !adjustingProduct) return;

    setAdjustError(null);
    setIsSubmitting(true);

    try {
      await adjustStock(session.tenant.id, session.location.id, adjustingProduct.id, {
        type: adjustType,
        quantity: adjustQty || '0',
        reason: adjustReason,
        expectedVersion: adjustingProduct.version,
      });

      setIsAdjustModalOpen(false);
    } catch (err: unknown) {
      const msg = (err as Error).message || '';
      if (
        msg.includes('409') ||
        msg.toLowerCase().includes('conflicto') ||
        msg.toLowerCase().includes('concurrencia')
      ) {
        setAdjustError(
          'Conflicto de concurrencia: el inventario fue modificado por otra terminal. Se recargaron los datos actualizados.'
        );
        refreshCatalog();
      } else {
        setAdjustError(msg || 'Error al ajustar el inventario.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Create Category
  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      const created = await createCategory(
        { name: newCategoryName.trim() },
        session?.tenant?.id,
        session?.location?.id
      );
      setFormCategoryId(created.id);
      setIsCreatingCategory(false);
      setNewCategoryName('');
    } catch (err: unknown) {
      setFormError((err as Error).message || 'Error al crear la categoría.');
    }
  };

  // Quick slot toggle
  const handleAssignQuickSlot = async (slot: number) => {
    if (!session?.tenant?.id || !session?.location?.id) return;
    const currentOccupant = quickProducts.find((p) => p.quickSlot === slot);

    if (currentOccupant) {
      if (window.confirm(`¿Liberar el slot [${slot}] ocupado por "${currentOccupant.name}"?`)) {
        await updateLocationSettings(session.tenant.id, session.location.id, currentOccupant.id, {
          quickSlot: null,
        });
      }
    } else {
      alert(`Para asignar un producto al slot [${slot}], editá el producto y seleccionalo.`);
    }
  };

  // Toggle Branch Availability (Point 4)
  const handleToggleAvailability = async (prod: CatalogProductItem) => {
    if (!session?.tenant?.id || !session?.location?.id) return;
    try {
      await updateLocationSettings(session.tenant.id, session.location.id, prod.id, {
        isAvailable: !prod.isAvailable,
      });
    } catch (err: unknown) {
      alert((err as Error).message || 'Error al cambiar disponibilidad en la sucursal.');
    }
  };

  // Toggle Product Active/Inactive (Point 3)
  const handleToggleActive = async (prod: CatalogProductItem) => {
    if (!session?.tenant?.id || !session?.location?.id) return;
    try {
      await updateProduct(session.tenant.id, session.location.id, prod.id, {
        isActive: !prod.isActive,
      });
    } catch (err: unknown) {
      alert((err as Error).message || 'Error al cambiar estado del producto.');
    }
  };

  // Filter products for in-memory / instant view
  const filteredProducts = products.filter((p) => {
    if (categoryFilter !== 'ALL' && p.categoryId !== categoryFilter) {
      return false;
    }
    if (statusFilter === 'ACTIVE' && !p.isActive) return false;
    if (statusFilter === 'INACTIVE' && p.isActive) return false;

    if (!searchFilter.trim()) return true;
    const normalizedQ = normalizeSearchText(searchFilter);
    return (
      normalizeSearchText(p.name).includes(normalizedQ) ||
      (p.barcode && p.barcode.includes(searchFilter.trim())) ||
      (p.sku && normalizeSearchText(p.sku).includes(normalizedQ))
    );
  });

  return {
    session,
    products,
    quickProducts,
    categories,
    filteredProducts,
    total,
    page,
    limit,
    totalPages,
    statusFilter,
    isLoading,
    error,
    searchFilter,
    categoryFilter,
    isProductModalOpen,
    editingProduct,
    isAdjustModalOpen,
    adjustingProduct,
    isHistoryModalOpen,
    historyProduct,
    movements,
    isHistoryLoading,
    formName,
    formCategoryId,
    formBarcode,
    formSku,
    formPrice,
    formCost,
    formInitialStock,
    formMinStock,
    formQuickSlot,
    formIsActive,
    formIsAvailable,
    formError,
    isSubmitting,
    isCreatingCategory,
    newCategoryName,
    adjustType,
    adjustQty,
    adjustReason,
    adjustError,
    setSearchFilter,
    setCategoryFilter,
    setStatusFilter,
    setPage,
    setIsProductModalOpen,
    setIsAdjustModalOpen,
    setIsHistoryModalOpen,
    setFormName,
    setFormCategoryId,
    setFormBarcode,
    setFormSku,
    setFormPrice,
    setFormCost,
    setFormInitialStock,
    setFormMinStock,
    setFormQuickSlot,
    setFormIsActive,
    setFormIsAvailable,
    setIsCreatingCategory,
    setNewCategoryName,
    setAdjustType,
    setAdjustQty,
    setAdjustReason,
    handleOpenCreate,
    handleOpenEdit,
    handleOpenAdjust,
    handleOpenHistory,
    handleSubmitProduct,
    handleSubmitAdjust,
    handleCreateCategory,
    handleAssignQuickSlot,
    handleToggleAvailability,
    handleToggleActive,
    refreshCatalog,
  };
}
