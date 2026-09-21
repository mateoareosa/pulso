import { Injectable } from '@nestjs/common';
import type { ProductImportColumn } from '@pulso/contracts';
import { inflateRawSync } from 'node:zlib';

export const MAX_PRODUCT_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_PRODUCT_IMPORT_ROWS = 500;
export const MAX_PRODUCT_IMPORT_COLUMNS = 20;
export const MAX_PRODUCT_IMPORT_CELL_CHARS = 1000;

const MAX_XLSX_UNCOMPRESSED_BYTES = 25 * 1024 * 1024;
const MAX_XLSX_ARCHIVE_ENTRIES = 200;

const CSV_MIME_TYPES = new Set(['text/csv', 'application/csv', 'text/plain']);
const XLSX_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const HEADER_ALIASES: Readonly<Record<string, ProductImportColumn>> = {
  name: 'name',
  nombre: 'name',
  producto: 'name',
  product: 'name',
  category: 'category',
  categoria: 'category',
  rubro: 'category',
  barcode: 'barcode',
  ean: 'barcode',
  'codigo de barras': 'barcode',
  'codigo barras': 'barcode',
  sku: 'sku',
  'codigo sku': 'sku',
  salepricecents: 'salePriceCents',
  'sale price cents': 'salePriceCents',
  'precio venta centavos': 'salePriceCents',
  'precio de venta centavos': 'salePriceCents',
  costpricecents: 'costPriceCents',
  'cost price cents': 'costPriceCents',
  'costo centavos': 'costPriceCents',
  'precio costo centavos': 'costPriceCents',
  'precio de costo centavos': 'costPriceCents',
  unit: 'unit',
  unidad: 'unit',
  initialstock: 'initialStock',
  'initial stock': 'initialStock',
  'stock inicial': 'initialStock',
  minimumstock: 'minimumStock',
  'minimum stock': 'minimumStock',
  'stock minimo': 'minimumStock',
  quickslot: 'quickSlot',
  'quick slot': 'quickSlot',
  'slot rapido': 'quickSlot',
  'acceso rapido': 'quickSlot',
  isavailable: 'isAvailable',
  available: 'isAvailable',
  disponible: 'isAvailable',
  activo: 'isAvailable',
};

const FORBIDDEN_SCOPE_HEADERS = new Set([
  'tenant',
  'tenant id',
  'tenantid',
  'negocio',
  'negocio id',
  'location',
  'location id',
  'locationid',
  'ubicacion',
  'ubicacion id',
  'sede',
  'sede id',
  'user id',
  'userid',
  'usuario id',
  'scope',
]);

export type ProductImportFormat = 'csv' | 'xlsx';

export interface ProductImportFile {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}

export interface ParsedProductImportRow {
  row: number;
  values: Partial<Record<ProductImportColumn, string>>;
}

export interface ParsedProductImportFile {
  format: ProductImportFormat;
  headers: ProductImportColumn[];
  rows: ParsedProductImportRow[];
}

export class ProductImportParseError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ProductImportParseError';
  }
}

interface CsvRow {
  line: number;
  cells: string[];
}

interface ZipEntry {
  compressedSize: number;
  compressionMethod: number;
  localHeaderOffset: number;
  uncompressedSize: number;
}

function fail(code: string, message: string): never {
  throw new ProductImportParseError(code, message);
}

function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalizeHeaders(rawHeaders: string[]): ProductImportColumn[] {
  if (rawHeaders.length > MAX_PRODUCT_IMPORT_COLUMNS) {
    fail(
      'TOO_MANY_COLUMNS',
      `El archivo supera el máximo de ${MAX_PRODUCT_IMPORT_COLUMNS} columnas`
    );
  }

  const headers: ProductImportColumn[] = [];
  const seen = new Set<ProductImportColumn>();

  for (const rawHeader of rawHeaders) {
    const normalized = normalizeHeader(rawHeader.replace(/^\uFEFF/, ''));
    if (!normalized) {
      fail('EMPTY_HEADER', 'Todas las columnas deben tener un encabezado');
    }
    if (FORBIDDEN_SCOPE_HEADERS.has(normalized)) {
      fail(
        'FORBIDDEN_SCOPE_COLUMN',
        `La columna de alcance "${rawHeader.trim()}" no está permitida`
      );
    }

    const canonical = HEADER_ALIASES[normalized];
    if (!canonical) {
      fail('UNKNOWN_HEADER', `La columna "${rawHeader.trim()}" no está permitida`);
    }
    if (seen.has(canonical)) {
      fail('DUPLICATE_HEADER', `La columna "${canonical}" está repetida`);
    }

    seen.add(canonical);
    headers.push(canonical);
  }

  for (const required of ['name', 'salePriceCents'] as const) {
    if (!seen.has(required)) {
      fail('MISSING_REQUIRED_HEADER', `Falta la columna obligatoria "${required}"`);
    }
  }

  return headers;
}

function assertCellSize(value: string, row: number, column: number): void {
  if (value.length > MAX_PRODUCT_IMPORT_CELL_CHARS) {
    fail(
      'CELL_TOO_LARGE',
      `La celda de la fila ${row}, columna ${column} supera ${MAX_PRODUCT_IMPORT_CELL_CHARS} caracteres`
    );
  }
}

function detectCsvDelimiter(text: string): ',' | ';' {
  const firstLineEnd = text.search(/\r?\n/);
  const firstLine = text.slice(0, firstLineEnd === -1 ? undefined : firstLineEnd);
  const commaCount = parseCsv(firstLine, ',')[0]?.cells.length ?? 0;
  const semicolonCount = parseCsv(firstLine, ';')[0]?.cells.length ?? 0;
  return semicolonCount > commaCount ? ';' : ',';
}

function parseCsv(text: string, delimiter: ',' | ';'): CsvRow[] {
  const rows: CsvRow[] = [];
  let cells: string[] = [];
  let cell = '';
  let inQuotes = false;
  let afterQuote = false;
  let line = 1;
  let rowStartLine = 1;

  const finishCell = () => {
    cells.push(cell.trim());
    cell = '';
    afterQuote = false;
  };
  const finishRow = () => {
    finishCell();
    rows.push({ line: rowStartLine, cells });
    cells = [];
    rowStartLine = line + 1;
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] ?? '';

    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
          afterQuote = true;
        }
      } else {
        cell += character;
        if (character === '\n') line += 1;
      }
      continue;
    }

    if (character === '"') {
      if (cell.length > 0 || afterQuote) fail('MALFORMED_CSV', `CSV inválido en la línea ${line}`);
      inQuotes = true;
    } else if (character === delimiter) {
      finishCell();
    } else if (character === '\n') {
      if (cell.endsWith('\r')) cell = cell.slice(0, -1);
      finishRow();
      line += 1;
    } else if (afterQuote && !/\s/.test(character)) {
      fail('MALFORMED_CSV', `CSV inválido en la línea ${line}`);
    } else if (!afterQuote) {
      cell += character;
    }
  }

  if (inQuotes) fail('MALFORMED_CSV', `CSV inválido en la línea ${line}`);
  if (cell.length > 0 || cells.length > 0) finishRow();
  return rows;
}

function rowsToResult(format: ProductImportFormat, sourceRows: CsvRow[]): ParsedProductImportFile {
  if (sourceRows.length === 0) fail('EMPTY_FILE', 'El archivo está vacío');

  const headerRow = sourceRows[0];
  if (!headerRow) fail('EMPTY_FILE', 'El archivo está vacío');
  const headers = canonicalizeHeaders(headerRow.cells);
  const rows: ParsedProductImportRow[] = [];

  for (const sourceRow of sourceRows.slice(1)) {
    if (sourceRow.cells.every((value) => value === '')) continue;
    if (
      sourceRow.cells.length > MAX_PRODUCT_IMPORT_COLUMNS ||
      sourceRow.cells.length > headers.length
    ) {
      fail('TOO_MANY_COLUMNS', `La fila ${sourceRow.line} tiene más columnas que el encabezado`);
    }

    const values: Partial<Record<ProductImportColumn, string>> = {};
    headers.forEach((header, index) => {
      const value = sourceRow.cells[index] ?? '';
      assertCellSize(value, sourceRow.line, index + 1);
      values[header] = value;
    });
    rows.push({ row: sourceRow.line, values });

    if (rows.length > MAX_PRODUCT_IMPORT_ROWS) {
      fail('TOO_MANY_ROWS', `El archivo supera el máximo de ${MAX_PRODUCT_IMPORT_ROWS} filas`);
    }
  }

  return { format, headers, rows };
}

function readSafeXlsxArchive(buffer: Buffer): Map<string, ZipEntry> {
  const searchStart = Math.max(0, buffer.length - 65_557);
  let eocdOffset = -1;
  for (let index = buffer.length - 22; index >= searchStart; index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) {
      eocdOffset = index;
      break;
    }
  }
  if (eocdOffset < 0) fail('INVALID_FILE_SIGNATURE', 'El archivo XLSX no contiene un ZIP válido');

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (entryCount === 0xffff || centralOffset === 0xffffffff) {
    fail('UNSAFE_XLSX_ARCHIVE', 'Los archivos XLSX con ZIP64 no están permitidos');
  }
  if (entryCount > MAX_XLSX_ARCHIVE_ENTRIES) {
    fail('UNSAFE_XLSX_ARCHIVE', 'El archivo XLSX contiene demasiadas entradas internas');
  }

  let offset = centralOffset;
  let totalUncompressed = 0;
  const entries = new Map<string, ZipEntry>();
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) {
      fail('INVALID_FILE_SIGNATURE', 'El directorio del archivo XLSX es inválido');
    }
    const flags = buffer.readUInt16LE(offset + 8);
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const nextOffset = nameStart + nameLength + extraLength + commentLength;
    if (
      nextOffset > buffer.length ||
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localHeaderOffset === 0xffffffff
    ) {
      fail('UNSAFE_XLSX_ARCHIVE', 'El archivo XLSX contiene una entrada inválida');
    }
    if ((flags & 0x1) !== 0 || ![0, 8].includes(compressionMethod)) {
      fail('UNSAFE_XLSX_ARCHIVE', 'El archivo XLSX usa cifrado o compresión no permitidos');
    }

    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_XLSX_UNCOMPRESSED_BYTES) {
      fail('UNSAFE_XLSX_ARCHIVE', 'El contenido descomprimido del XLSX supera el límite seguro');
    }
    const name = buffer.toString('utf8', nameStart, nameStart + nameLength).replace(/\\/g, '/');
    if (name.startsWith('/') || name.split('/').includes('..')) {
      fail('UNSAFE_XLSX_ARCHIVE', 'El archivo XLSX contiene una ruta interna no permitida');
    }
    entries.set(name, {
      compressedSize,
      compressionMethod,
      localHeaderOffset,
      uncompressedSize,
    });
    offset = nextOffset;
  }

  if (!entries.has('[Content_Types].xml') || !entries.has('xl/workbook.xml')) {
    fail('INVALID_FILE_SIGNATURE', 'El archivo no tiene la estructura requerida de un XLSX');
  }
  return entries;
}

function extractZipEntry(buffer: Buffer, entry: ZipEntry): string {
  const offset = entry.localHeaderOffset;
  if (offset + 30 > buffer.length || buffer.readUInt32LE(offset) !== 0x04034b50) {
    fail('INVALID_FILE_SIGNATURE', 'El archivo XLSX contiene una entrada local inválida');
  }
  const dataStart =
    offset + 30 + buffer.readUInt16LE(offset + 26) + buffer.readUInt16LE(offset + 28);
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > buffer.length) fail('INVALID_FILE_SIGNATURE', 'El archivo XLSX está truncado');

  let content: Buffer;
  try {
    const compressed = buffer.subarray(dataStart, dataEnd);
    content =
      entry.compressionMethod === 0
        ? Buffer.from(compressed)
        : inflateRawSync(compressed, { maxOutputLength: entry.uncompressedSize });
  } catch {
    fail('MALFORMED_XLSX', 'No se pudo descomprimir el archivo XLSX');
  }
  if (content.length !== entry.uncompressedSize) {
    fail('MALFORMED_XLSX', 'El tamaño interno del archivo XLSX es inválido');
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(content);
  } catch {
    fail('MALFORMED_XLSX', 'El contenido XML del XLSX no está codificado en UTF-8');
  }
}

function assertSafeXml(xml: string): void {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    fail('UNSAFE_XLSX_XML', 'El archivo XLSX contiene declaraciones XML no permitidas');
  }
}

function decodeXmlText(value: string): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code: string) => {
      const point = code.toLowerCase().startsWith('x')
        ? Number.parseInt(code.slice(1), 16)
        : Number.parseInt(code, 10);
      return Number.isSafeInteger(point) && point >= 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : '';
    })
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function xmlAttribute(attributes: string, name: string): string | undefined {
  return attributes.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1];
}

function columnNumber(reference: string): number {
  const letters = reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase();
  if (!letters) return 0;
  let result = 0;
  for (const letter of letters) result = result * 26 + letter.charCodeAt(0) - 64;
  return result;
}

function firstWorksheetPath(buffer: Buffer, entries: Map<string, ZipEntry>): string {
  const workbookEntry = entries.get('xl/workbook.xml');
  const relationshipsEntry = entries.get('xl/_rels/workbook.xml.rels');
  if (!workbookEntry || !relationshipsEntry) {
    fail('INVALID_FILE_SIGNATURE', 'El archivo XLSX no define sus hojas de cálculo');
  }
  const workbookXml = extractZipEntry(buffer, workbookEntry);
  const relationshipsXml = extractZipEntry(buffer, relationshipsEntry);
  assertSafeXml(workbookXml);
  assertSafeXml(relationshipsXml);
  const relationshipId = workbookXml.match(/<sheet\b[^>]*\br:id="([^"]+)"/i)?.[1];
  if (!relationshipId) fail('EMPTY_FILE', 'El archivo XLSX no contiene hojas');
  for (const match of relationshipsXml.matchAll(/<Relationship\b([^>]*)\/?\s*>/gi)) {
    const attributes = match[1] ?? '';
    if (xmlAttribute(attributes, 'Id') !== relationshipId) continue;
    const target = xmlAttribute(attributes, 'Target');
    if (!target || /(^|\/)\.\.($|\/)/.test(target)) {
      fail('UNSAFE_XLSX_ARCHIVE', 'La hoja XLSX apunta a una ruta no permitida');
    }
    return target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  }
  fail('INVALID_FILE_SIGNATURE', 'No se pudo resolver la primera hoja del XLSX');
}

function readSharedStrings(buffer: Buffer, entries: Map<string, ZipEntry>): string[] {
  const entry = entries.get('xl/sharedStrings.xml');
  if (!entry) return [];
  const xml = extractZipEntry(buffer, entry);
  assertSafeXml(xml);
  return Array.from(xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi), (match) =>
    decodeXmlText(match[1] ?? '').trim()
  );
}

function parseWorksheetXml(xml: string, sharedStrings: string[]): CsvRow[] {
  assertSafeXml(xml);
  const rows: CsvRow[] = [];
  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/gi)) {
    const rowNumber = Number.parseInt(xmlAttribute(rowMatch[1] ?? '', 'r') ?? '', 10);
    if (!Number.isInteger(rowNumber) || rowNumber < 1 || rowNumber > MAX_PRODUCT_IMPORT_ROWS + 1) {
      fail('TOO_MANY_ROWS', `El archivo supera el máximo de ${MAX_PRODUCT_IMPORT_ROWS} filas`);
    }
    const cells: string[] = [];
    for (const cellMatch of (rowMatch[2] ?? '').matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)) {
      const attributes = cellMatch[1] ?? '';
      const body = cellMatch[2] ?? '';
      const column = columnNumber(xmlAttribute(attributes, 'r') ?? '');
      if (column < 1 || column > MAX_PRODUCT_IMPORT_COLUMNS) {
        fail(
          'TOO_MANY_COLUMNS',
          `La fila ${rowNumber} supera ${MAX_PRODUCT_IMPORT_COLUMNS} columnas`
        );
      }
      if (/<f\b/i.test(body)) {
        fail(
          'FORMULA_NOT_ALLOWED',
          `No se permiten fórmulas en la fila ${rowNumber}, columna ${column}`
        );
      }
      const type = xmlAttribute(attributes, 't');
      const rawValue =
        type === 'inlineStr'
          ? Array.from(body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi), (match) =>
              decodeXmlText(match[1] ?? '')
            ).join('')
          : decodeXmlText(body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i)?.[1] ?? '');
      let value = rawValue;
      if (type === 's') {
        value =
          sharedStrings[Number.parseInt(rawValue, 10)] ??
          fail('INVALID_CELL_VALUE', 'Referencia de texto inválida');
      } else if (type === 'b') {
        value = rawValue === '1' ? 'true' : rawValue === '0' ? 'false' : rawValue;
      }
      value = value.trim();
      assertCellSize(value, rowNumber, column);
      while (cells.length < column - 1) cells.push('');
      cells[column - 1] = value;
    }
    while (cells.at(-1) === '') cells.pop();
    rows.push({ line: rowNumber, cells });
  }
  return rows;
}

function parseXlsx(buffer: Buffer): ParsedProductImportFile {
  const entries = readSafeXlsxArchive(buffer);
  try {
    const worksheetEntry = entries.get(firstWorksheetPath(buffer, entries));
    if (!worksheetEntry) fail('INVALID_FILE_SIGNATURE', 'La primera hoja XLSX no existe');
    const xml = extractZipEntry(buffer, worksheetEntry);
    return rowsToResult('xlsx', parseWorksheetXml(xml, readSharedStrings(buffer, entries)));
  } catch (error) {
    if (error instanceof ProductImportParseError) throw error;
    fail('MALFORMED_XLSX', 'No se pudo leer el archivo XLSX');
  }
}

export async function parseProductImportFile(
  file: ProductImportFile
): Promise<ParsedProductImportFile> {
  if (file.buffer.length === 0) fail('EMPTY_FILE', 'El archivo está vacío');
  if (file.buffer.length > MAX_PRODUCT_IMPORT_BYTES) {
    fail('FILE_TOO_LARGE', 'El archivo supera el tamaño máximo de 5 MB');
  }

  const extension = file.fileName.toLowerCase().match(/\.[^.]+$/)?.[0];
  const hasZipSignature = file.buffer.length >= 4 && file.buffer.readUInt32LE(0) === 0x04034b50;

  if (extension === '.xlsx' && XLSX_MIME_TYPES.has(file.mimeType) && hasZipSignature) {
    return parseXlsx(file.buffer);
  }
  if (extension === '.csv' && CSV_MIME_TYPES.has(file.mimeType) && !hasZipSignature) {
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(file.buffer);
    } catch {
      fail('INVALID_FILE_SIGNATURE', 'El CSV debe estar codificado en UTF-8');
    }
    if (text.includes('\0'))
      fail('INVALID_FILE_SIGNATURE', 'El archivo no es un CSV de texto válido');
    return rowsToResult('csv', parseCsv(text, detectCsvDelimiter(text)));
  }

  fail('INVALID_FILE_SIGNATURE', 'La extensión, el tipo MIME y la firma del archivo no coinciden');
}

@Injectable()
export class ProductImportParser {
  parse(file: ProductImportFile): Promise<ParsedProductImportFile> {
    return parseProductImportFile(file);
  }
}
