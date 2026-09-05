import React from 'react';
import { useProductsManagement } from '../hooks/useProductsManagement';
import { ProductsToolbar } from './ProductsToolbar';
import { QuickSlotsRibbon } from './QuickSlotsRibbon';
import { ProductsTable } from './ProductsTable';
import { ProductFormDialog } from './ProductFormDialog';
import { StockAdjustmentDialog } from './StockAdjustmentDialog';
import { InventoryHistoryDialog } from './InventoryHistoryDialog';

export const ProductsScreen: React.FC = () => {
  const m = useProductsManagement();

  return (
    <div
      style={{
        padding: '16px 20px',
        maxWidth: '1440px',
        margin: '0 auto',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <ProductsToolbar
        tenantName={m.session?.tenant?.name}
        locationName={m.session?.location?.name}
        totalProducts={m.products.length}
        searchFilter={m.searchFilter}
        categoryFilter={m.categoryFilter}
        statusFilter={m.statusFilter}
        categories={m.categories}
        onSearchChange={m.setSearchFilter}
        onCategoryChange={m.setCategoryFilter}
        onStatusChange={m.setStatusFilter}
        onOpenCreate={m.handleOpenCreate}
      />

      <QuickSlotsRibbon
        products={m.quickProducts}
        onOpenEdit={m.handleOpenEdit}
        onAssignQuickSlot={m.handleAssignQuickSlot}
      />

      <ProductsTable
        products={m.products}
        filteredProducts={m.filteredProducts}
        total={m.total}
        page={m.page}
        limit={m.limit}
        totalPages={m.totalPages}
        isLoading={m.isLoading}
        error={m.error}
        searchFilter={m.searchFilter}
        onRetry={() => m.refreshCatalog()}
        onOpenCreate={m.handleOpenCreate}
        onOpenAdjust={m.handleOpenAdjust}
        onOpenEdit={m.handleOpenEdit}
        onOpenHistory={m.handleOpenHistory}
        onPageChange={(p) => {
          m.setPage(p);
          m.refreshCatalog(p);
        }}
      />

      <ProductFormDialog
        isOpen={m.isProductModalOpen}
        editingProduct={m.editingProduct}
        categories={m.categories}
        formName={m.formName}
        formCategoryId={m.formCategoryId}
        formBarcode={m.formBarcode}
        formSku={m.formSku}
        formPrice={m.formPrice}
        formCost={m.formCost}
        formInitialStock={m.formInitialStock}
        formMinStock={m.formMinStock}
        formQuickSlot={m.formQuickSlot}
        formIsActive={m.formIsActive}
        formIsAvailable={m.formIsAvailable}
        formError={m.formError}
        isSubmitting={m.isSubmitting}
        isCreatingCategory={m.isCreatingCategory}
        newCategoryName={m.newCategoryName}
        onClose={() => m.setIsProductModalOpen(false)}
        onSubmit={m.handleSubmitProduct}
        onNameChange={m.setFormName}
        onCategoryChange={m.setFormCategoryId}
        onBarcodeChange={m.setFormBarcode}
        onSkuChange={m.setFormSku}
        onPriceChange={m.setFormPrice}
        onCostChange={m.setFormCost}
        onInitialStockChange={m.setFormInitialStock}
        onMinStockChange={m.setFormMinStock}
        onQuickSlotChange={m.setFormQuickSlot}
        onIsActiveToggle={() => m.setFormIsActive(!m.formIsActive)}
        onIsAvailableToggle={() => m.setFormIsAvailable(!m.formIsAvailable)}
        onStartCreateCategory={() => m.setIsCreatingCategory(true)}
        onCancelCreateCategory={() => m.setIsCreatingCategory(false)}
        onNewCategoryNameChange={m.setNewCategoryName}
        onCreateCategory={m.handleCreateCategory}
      />

      <StockAdjustmentDialog
        isOpen={m.isAdjustModalOpen}
        adjustingProduct={m.adjustingProduct}
        adjustType={m.adjustType}
        adjustQty={m.adjustQty}
        adjustReason={m.adjustReason}
        adjustError={m.adjustError}
        isSubmitting={m.isSubmitting}
        onClose={() => m.setIsAdjustModalOpen(false)}
        onSubmit={m.handleSubmitAdjust}
        onTypeChange={m.setAdjustType}
        onQtyChange={m.setAdjustQty}
        onReasonChange={m.setAdjustReason}
      />

      <InventoryHistoryDialog
        isOpen={m.isHistoryModalOpen}
        historyProduct={m.historyProduct}
        movements={m.movements}
        isHistoryLoading={m.isHistoryLoading}
        onClose={() => m.setIsHistoryModalOpen(false)}
      />
    </div>
  );
};
