import React, { useState } from 'react';
import { usePurchasesStore } from '../store/purchases.store';
import type { SupplierResponse } from '@pulso/contracts';

interface SuppliersViewProps {
  context: { tenantId: string; locationId: string };
  isOffline: boolean;
}

export const SuppliersView: React.FC<SuppliersViewProps> = ({ context, isOffline }) => {
  const {
    suppliers,
    isLoadingSuppliers,
    suppliersError,
    actionError,
    isSubmitting,
    loadSuppliers,
    createSupplier,
    updateSupplier,
    toggleSupplierStatus,
    clearActionError,
  } = usePurchasesStore();

  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierResponse | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formTaxId, setFormTaxId] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formValidation, setFormValidation] = useState<string | null>(null);

  const openCreateModal = () => {
    clearActionError();
    setFormValidation(null);
    setEditingSupplier(null);
    setFormName('');
    setFormTaxId('');
    setFormPhone('');
    setFormEmail('');
    setFormAddress('');
    setFormNotes('');
    setIsModalOpen(true);
  };

  const openEditModal = (sup: SupplierResponse) => {
    clearActionError();
    setFormValidation(null);
    setEditingSupplier(sup);
    setFormName(sup.name);
    setFormTaxId(sup.taxId || '');
    setFormPhone(sup.phone || '');
    setFormEmail(sup.email || '');
    setFormAddress(sup.address || '');
    setFormNotes(sup.notes || '');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingSupplier(null);
    setFormValidation(null);
    clearActionError();
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormValidation(null);
    clearActionError();

    if (!formName.trim()) {
      setFormValidation('El nombre del proveedor es obligatorio');
      return;
    }

    if (formTaxId.trim() && !/^\d{2}-?\d{8}-?\d{1}$/.test(formTaxId.trim())) {
      setFormValidation('El CUIT debe tener un formato válido (ej: 30-71234567-9 o 30712345679)');
      return;
    }

    if (editingSupplier) {
      const ok = await updateSupplier(
        editingSupplier.id,
        {
          name: formName.trim(),
          taxId: formTaxId.trim() || null,
          phone: formPhone.trim() || null,
          email: formEmail.trim() || null,
          address: formAddress.trim() || null,
          notes: formNotes.trim() || null,
        },
        context
      );
      if (ok) closeModal();
    } else {
      const created = await createSupplier(
        {
          name: formName.trim(),
          taxId: formTaxId.trim() || null,
          phone: formPhone.trim() || null,
          email: formEmail.trim() || null,
          address: formAddress.trim() || null,
          notes: formNotes.trim() || null,
        },
        context
      );
      if (created) closeModal();
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadSuppliers(context, { search: search.trim() || undefined });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header Controls */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--radius-pill, 12px)',
        }}
      >
        <form
          onSubmit={handleSearchSubmit}
          style={{ display: 'flex', gap: 'var(--radius-sm, 8px)', alignItems: 'center', flex: 1, maxWidth: '480px' }}
        >
          <input className="pulso-input"
            type="text"
            data-testid="supplier-search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar proveedor por nombre, CUIT, teléfono..."
            disabled={isOffline}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              border: '2px solid var(--color-border)',
              backgroundColor: 'var(--color-surface-sunken, var(--color-surface))',
              color: 'var(--color-ink)',
            }}
          />
          <button className="pulso-button pulso-button--md"
            type="submit"
            data-testid="supplier-search-button"
            disabled={isOffline}
            style={{
              padding: '8px 14px',
              fontWeight: 700,
              cursor: isOffline ? 'not-allowed' : 'pointer',
              backgroundColor: 'var(--color-pulse-solid)',
              color: '#0f172a',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            Buscar
          </button>
        </form>

        <button className="pulso-button pulso-button--md"
          type="button"
          data-testid="create-supplier-button"
          onClick={openCreateModal}
          disabled={isOffline}
          style={{
            padding: '8px 16px',
            backgroundColor: 'var(--color-pulse-solid)',
            color: '#0f172a',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            fontWeight: 800,
            cursor: isOffline ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--radius-sm, 6px)',
          }}
        >
          + NUEVO PROVEEDOR
        </button>
      </div>

      {suppliersError && (
        <div
          role="alert"
          style={{
            padding: '10px 12px',
            backgroundColor: 'var(--color-danger-soft, #fee2e2)',
            color: 'var(--color-danger-solid)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--text-sm)',
          }}
        >
          {suppliersError}
        </div>
      )}

      {/* Suppliers Table */}
      <div
        style={{
          backgroundColor: 'var(--color-surface-sunken, var(--color-surface))',
          border: '2px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          overflow: 'hidden',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr
              style={{
                backgroundColor: 'var(--color-surface-sunken)',
                borderBottom: '1px solid var(--color-border)',
              }}
            >
              <th style={{ padding: '10px 12px', fontSize: 'var(--text-xs)', fontWeight: 800 }}>
                PROVEEDOR
              </th>
              <th style={{ padding: '10px 12px', fontSize: 'var(--text-xs)', fontWeight: 800 }}>
                CUIT
              </th>
              <th style={{ padding: '10px 12px', fontSize: 'var(--text-xs)', fontWeight: 800 }}>
                TELÉFONO / EMAIL
              </th>
              <th style={{ padding: '10px 12px', fontSize: 'var(--text-xs)', fontWeight: 800 }}>
                DIRECCIÓN
              </th>
              <th style={{ padding: '10px 12px', fontSize: 'var(--text-xs)', fontWeight: 800 }}>
                ESTADO
              </th>
              <th
                style={{
                  padding: '10px 12px',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 800,
                  textAlign: 'right',
                }}
              >
                ACCIONES
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoadingSuppliers ? (
              <tr>
                <td
                  colSpan={6}
                  style={{ padding: '24px', textAlign: 'center', color: 'var(--color-ink-muted)' }}
                >
                  Cargando proveedores...
                </td>
              </tr>
            ) : suppliers.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  data-testid="no-suppliers-msg"
                  style={{ padding: '24px', textAlign: 'center', color: 'var(--color-ink-muted)' }}
                >
                  No se encontraron proveedores registrados.
                </td>
              </tr>
            ) : (
              suppliers.map((sup) => (
                <tr
                  key={sup.id}
                  data-testid={`supplier-row-${sup.id}`}
                  style={{
                    borderBottom: '1px solid var(--color-border)',
                    opacity: sup.isActive ? 1 : 0.6,
                  }}
                >
                  <td style={{ padding: '10px 12px', fontWeight: 700 }}>{sup.name}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>
                    {sup.taxId ? sup.taxId.replace(/(\d{2})(\d{8})(\d{1})/, '$1-$2-$3') : '—'}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <div>{sup.phone || '—'}</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)' }}>
                      {sup.email || ''}
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px' }}>{sup.address || '—'}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-pill, 12px)',
                        fontSize: 'var(--text-xs)',
                        fontWeight: 700,
                        backgroundColor: sup.isActive ? 'var(--color-success-soft, #dcfce7)' : 'var(--color-neutral-soft, #f3f4f6)',
                        color: sup.isActive ? 'var(--color-success-strong, #15803d)' : 'var(--color-ink-muted, #6b7280)',
                      }}
                    >
                      {sup.isActive ? 'ACTIVO' : 'INACTIVO'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 'var(--radius-sm, 8px)', justifyContent: 'flex-end' }}>
                      <button className="pulso-button pulso-button--md"
                        type="button"
                        data-testid={`edit-supplier-${sup.id}`}
                        onClick={() => openEditModal(sup)}
                        disabled={isOffline}
                        style={{
                          padding: '4px 8px',
                          fontSize: 'var(--text-xs)',
                          border: '2px solid var(--color-border)',
                          backgroundColor: 'var(--color-surface-sunken, var(--color-surface))',
                          borderRadius: 'var(--radius-sm)',
                          cursor: isOffline ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Editar
                      </button>
                      <button className="pulso-button pulso-button--md"
                        type="button"
                        data-testid={`toggle-status-supplier-${sup.id}`}
                        onClick={() => toggleSupplierStatus(sup.id, !sup.isActive, context)}
                        disabled={isOffline || isSubmitting}
                        style={{
                          padding: '4px 8px',
                          fontSize: 'var(--text-xs)',
                          border: 'none',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: sup.isActive ? 'var(--color-danger-soft, #fee2e2)' : 'var(--color-success-soft, #dcfce7)',
                          color: sup.isActive ? 'var(--color-danger-solid)' : 'var(--color-success-strong, #15803d)',
                          cursor: isOffline || isSubmitting ? 'not-allowed' : 'pointer',
                          fontWeight: 700,
                        }}
                      >
                        {sup.isActive ? 'Desactivar' : 'Activar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Supplier Create/Edit Modal */}
      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="supplier-modal"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'var(--color-overlay, rgba(0,0,0,0.5))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--color-surface, #ffffff)',
              borderRadius: 'var(--radius-lg, 12px)',
              padding: '24px',
              width: '100%',
              maxWidth: '520px',
              boxShadow: 'var(--shadow-modal, 0 20px 25px -5px rgba(0, 0, 0, 0.16))',
            }}
          >
            <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 800 }}>
              {editingSupplier ? 'Editar Proveedor' : 'Nuevo Proveedor'}
            </h2>

            {(formValidation || actionError) && (
              <div
                role="alert"
                data-testid="supplier-form-error"
                style={{
                  padding: '8px 12px',
                  backgroundColor: 'var(--color-danger-soft, #fee2e2)',
                  color: 'var(--color-danger-solid)',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: 'var(--radius-pill, 12px)',
                  fontSize: 'var(--text-sm)',
                }}
              >
                {formValidation || actionError}
              </div>
            )}

            <form
              onSubmit={handleSave}
              style={{ display: 'flex', flexDirection: 'column', gap: 'var(--radius-pill, 12px)' }}
            >
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 700,
                    marginBottom: 'var(--radius-xs, 4px)',
                  }}
                >
                  Razón Social / Nombre *
                </label>
                <input className="pulso-input"
                  type="text"
                  data-testid="supplier-form-name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ej: Distribuidora Arcor"
                  required
                  style={{
                    width: '100%',
                    padding: 'var(--radius-sm, 8px)',
                    borderRadius: 'var(--radius-sm, 8px)',
                    border: '2px solid var(--color-border)',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 700,
                    marginBottom: 'var(--radius-xs, 4px)',
                  }}
                >
                  CUIT (Opcional)
                </label>
                <input className="pulso-input"
                  type="text"
                  data-testid="supplier-form-taxid"
                  value={formTaxId}
                  onChange={(e) => setFormTaxId(e.target.value)}
                  placeholder="30-71234567-9"
                  style={{
                    width: '100%',
                    padding: 'var(--radius-sm, 8px)',
                    borderRadius: 'var(--radius-sm, 8px)',
                    border: '2px solid var(--color-border)',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 700,
                    marginBottom: 'var(--radius-xs, 4px)',
                  }}
                >
                  Teléfono
                </label>
                <input className="pulso-input"
                  type="text"
                  data-testid="supplier-form-phone"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="11-2345-6789"
                  style={{
                    width: '100%',
                    padding: 'var(--radius-sm, 8px)',
                    borderRadius: 'var(--radius-sm, 8px)',
                    border: '2px solid var(--color-border)',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 700,
                    marginBottom: 'var(--radius-xs, 4px)',
                  }}
                >
                  Correo Electrónico
                </label>
                <input className="pulso-input"
                  type="email"
                  data-testid="supplier-form-email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="contacto@proveedor.com"
                  style={{
                    width: '100%',
                    padding: 'var(--radius-sm, 8px)',
                    borderRadius: 'var(--radius-sm, 8px)',
                    border: '2px solid var(--color-border)',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 700,
                    marginBottom: 'var(--radius-xs, 4px)',
                  }}
                >
                  Dirección
                </label>
                <input className="pulso-input"
                  type="text"
                  data-testid="supplier-form-address"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  placeholder="Calle, Número, Localidad"
                  style={{
                    width: '100%',
                    padding: 'var(--radius-sm, 8px)',
                    borderRadius: 'var(--radius-sm, 8px)',
                    border: '2px solid var(--color-border)',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 700,
                    marginBottom: 'var(--radius-xs, 4px)',
                  }}
                >
                  Notas / Observaciones
                </label>
                <textarea
                  data-testid="supplier-form-notes"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Días de entrega, condiciones comerciales, etc."
                  rows={2}
                  style={{
                    width: '100%',
                    padding: 'var(--radius-sm, 8px)',
                    borderRadius: 'var(--radius-sm, 8px)',
                    border: '2px solid var(--color-border)',
                  }}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 'var(--radius-sm, 8px)',
                  marginTop: '16px',
                }}
              >
                <button className="pulso-button pulso-button--md"
                  type="button"
                  onClick={closeModal}
                  style={{
                    padding: '8px 16px',
                    border: '2px solid var(--color-border)',
                    backgroundColor: 'transparent',
                    borderRadius: 'var(--radius-sm, 8px)',
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button className="pulso-button pulso-button--md"
                  type="submit"
                  data-testid="supplier-form-submit"
                  disabled={isSubmitting}
                  style={{
                    padding: '8px 16px',
                    border: 'none',
                    backgroundColor: 'var(--color-pulse-solid)',
                    color: '#0f172a',
                    fontWeight: 700,
                    borderRadius: 'var(--radius-sm, 8px)',
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isSubmitting
                    ? 'Guardando...'
                    : editingSupplier
                      ? 'Guardar Cambios'
                      : 'Crear Proveedor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};



