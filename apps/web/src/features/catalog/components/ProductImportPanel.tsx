import React, { useRef, useState } from 'react';
import type { ProductImportPreviewResponse, ProductImportResult } from '@pulso/contracts';
import { ApiError } from '../../../services/api-client';
import { catalogApi } from '../services/catalog-api';
import { useAuth } from '../../auth/AuthContext';
import { IconClose, IconPurchase } from '@pulso/icons';
import './product-import.css';

const template = 'name,category,barcode,sku,salePriceCents,costPriceCents,unit,initialStock,minimumStock,quickSlot,isAvailable\nCafé molido,Bebidas,779000000001,CFE-001,4500,2800,unidad,10,2,,true\n';

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return 'No tenés permisos para importar productos.';
    if (error.status === 400) return error.message || 'El archivo no cumple el formato esperado.';
    if (error.status === 409) return 'El catálogo cambió mientras importabas. Revisá el archivo y volvé a previsualizar.';
    return error.message || 'No se pudo completar la importación.';
  }
  return error instanceof Error ? error.message : 'No se pudo completar la importación.';
}

interface ProductImportPanelProps {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onCommitted: () => void;
}

export const ProductImportPanel: React.FC<ProductImportPanelProps> = ({ isOpen, onOpen, onClose, onCommitted }) => {
  const { session } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<ProductImportPreviewResponse | null>(null);
  const [result, setResult] = useState<ProductImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const canImport = session?.role === 'OWNER' || session?.role === 'MANAGER';

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([template], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plantilla-productos.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const chooseFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setPreview(null);
    setResult(null);
    setError(null);
    setConfirmed(false);
    setBusy(true);
    try {
      setPreview(await catalogApi.previewProductImport(file));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!preview?.canCommit || !confirmed) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await catalogApi.commitProductImport(preview.previewToken));
      onCommitted();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  if (!canImport) {
    return <aside className="product-import product-import--locked" aria-label="Importación de productos">
      <strong>Importación masiva</strong>
      <p>Disponible para propietarios y encargados. Tu rol no puede cargar productos.</p>
    </aside>;
  }

  if (!isOpen) {
    return <button type="button" className="pulso-button pulso-button--primary product-import-trigger" onClick={onOpen}><IconPurchase size={16} /> <span>Importar productos</span></button>;
  }

  return <div className="product-import-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="product-import product-import--dialog" role="dialog" aria-modal="true" aria-labelledby="product-import-title">
    <div className="product-import__heading">
      <div>
        <p className="product-import__eyebrow">CATÁLOGO / CARGA MASIVA</p>
        <h2 id="product-import-title">Importar productos</h2>
        <p className="product-import__hint">Subí un CSV o Excel. Primero revisamos cada fila; nada se guarda sin tu confirmación.</p>
      </div>
      <div className="product-import__heading-actions">
        <button type="button" className="product-import__close" aria-label="Cerrar importación" onClick={onClose}><IconClose size={18} /></button>
        <button type="button" className="pulso-button pulso-button--secondary pulso-button--sm" onClick={downloadTemplate}>Descargar plantilla</button>
      </div>
    </div>

    <div className="product-import__upload" aria-label="Carga de archivo">
      <div className="product-import__upload-copy"><strong>Cargar archivo</strong><span>Usá un CSV o XLSX de hasta 500 filas.</span></div>
      <input ref={inputRef} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="product-import__file" aria-label="Elegir archivo CSV o Excel" onChange={(event) => void chooseFile(event.target.files?.[0])} />
      <button type="button" className="pulso-button pulso-button--secondary product-import__choose" onClick={() => inputRef.current?.click()} disabled={busy}>{busy ? 'Revisando archivo…' : 'Elegir archivo'}</button>
      <span className="product-import__filename">{fileName || 'Ningún archivo seleccionado'}</span>
    </div>

    {error && <p className="product-import__error" role="alert">{error}</p>}
    {preview && <div className="product-import__preview" aria-live="polite">
      <div className="product-import__summary">
        <span><b>{preview.summary.total}</b> filas</span><span className="is-valid"><b>{preview.summary.valid}</b> válidas</span><span className={preview.summary.invalid ? 'is-invalid' : 'is-valid'}><b>{preview.summary.invalid}</b> con errores</span>
      </div>
      {preview.errors.length > 0 && <div className="product-import__errors" role="alert"><strong>Corregí estas filas para continuar</strong><ul>{preview.errors.slice(0, 12).map((item, index) => <li key={`${item.row}-${item.field ?? 'general'}-${index}`}>Fila {item.row}{item.field ? ` · ${item.field}` : ''}: {item.message}</li>)}</ul>{preview.errors.length > 12 && <small>Se muestran los primeros 12 errores.</small>}</div>}
      <div className="product-import__table-wrap"><table><thead><tr><th>Fila</th><th>Producto</th><th>Precio</th><th>Unidad</th><th>Estado</th></tr></thead><tbody>{preview.rows.slice(0, 100).map((row) => { const rowError = preview.errors.some((item) => item.row === row.row); return <tr key={row.row}><td className="font-tabular">{row.row}</td><td>{row.name}</td><td className="font-tabular">{row.salePriceCents}</td><td>{row.unit}</td><td><span className={rowError ? 'product-import__badge product-import__badge--error' : 'product-import__badge'}>{rowError ? 'Revisar' : 'Lista'}</span></td></tr>; })}</tbody></table></div>
      {preview.canCommit && <label className="product-import__confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={busy} /> Confirmo que revisé la vista previa y quiero incorporar estas {preview.summary.valid} filas.</label>}
      <div className="product-import__actions"><button type="button" className="pulso-button pulso-button--primary" disabled={!preview.canCommit || !confirmed || busy} onClick={() => void commit()}>{busy ? 'Importando…' : 'Confirmar importación'}</button></div>
    </div>}
    {result && <p className="product-import__success" role="status">Importación completa: {result.importedCount} productos incorporados y {result.categoryCount} categorías creadas.</p>}
  </section></div>;
};
