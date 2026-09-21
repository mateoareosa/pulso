import { describe, expect, it } from 'vitest';
import {
  MAX_PRODUCT_IMPORT_BYTES,
  MAX_PRODUCT_IMPORT_COLUMNS,
  MAX_PRODUCT_IMPORT_ROWS,
  ProductImportParseError,
  ProductImportParser,
  parseProductImportFile,
} from '../src/catalog/product-import.parser.js';
import { CatalogModule } from '../src/catalog/catalog.module.js';

const CSV_MIME = 'text/csv';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function csvFile(content: string, fileName = 'productos.csv') {
  return { buffer: Buffer.from(content, 'utf8'), fileName, mimeType: CSV_MIME };
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries: Record<string, string>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const nameBytes = Buffer.from(name);
    const content = Buffer.from(text);
    const checksum = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    localParts.push(local, nameBytes, content);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBytes);
    offset += local.length + nameBytes.length + content.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function xlsxFile(
  rows: unknown[][],
  fileName = 'productos.xlsx',
  formulaCell?: { column: number; row: number }
) {
  const sheetRows = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, columnIndex) => {
          const reference = `${String.fromCharCode(65 + columnIndex)}${rowIndex + 1}`;
          if (formulaCell?.row === rowIndex + 1 && formulaCell.column === columnIndex + 1) {
            return `<c r="${reference}"><f>HYPERLINK(&quot;https://example.com&quot;)</f><v>Producto</v></c>`;
          }
          if (typeof value === 'boolean') {
            return `<c r="${reference}" t="b"><v>${value ? 1 : 0}</v></c>`;
          }
          if (typeof value === 'number') return `<c r="${reference}"><v>${value}</v></c>`;
          return `<c r="${reference}" t="inlineStr"><is><t>${xmlEscape(String(value))}</t></is></c>`;
        })
        .join('');
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join('');
  const buffer = zip({
    '[Content_Types].xml': '<?xml version="1.0"?><Types/>',
    'xl/workbook.xml':
      '<?xml version="1.0"?><workbook xmlns:r="relationships"><sheets><sheet name="Productos" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':
      '<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': `<?xml version="1.0"?><worksheet><sheetData>${sheetRows}</sheetData></worksheet>`,
  });
  return { buffer, fileName, mimeType: XLSX_MIME };
}

function expectParseError(error: unknown, code: string) {
  expect(error).toBeInstanceOf(ProductImportParseError);
  expect((error as ProductImportParseError).code).toBe(code);
}

describe('product import parser', () => {
  it('is exposed through the catalog module boundary', () => {
    const providers = Reflect.getMetadata('providers', CatalogModule) as unknown[];
    const exports = Reflect.getMetadata('exports', CatalogModule) as unknown[];

    expect(providers).toContain(ProductImportParser);
    expect(exports).toContain(ProductImportParser);
  });
  it('parses quoted CSV values and canonicalizes Spanish headers', async () => {
    const result = await parseProductImportFile(
      csvFile(
        '\uFEFFNombre;Categoría;Código de barras;Precio de venta centavos;Stock inicial\n' +
          '"Yerba, suave";Almacén;7790000000012;450000;12.5'
      )
    );

    expect(result).toEqual({
      format: 'csv',
      headers: ['name', 'category', 'barcode', 'salePriceCents', 'initialStock'],
      rows: [
        {
          row: 2,
          values: {
            name: 'Yerba, suave',
            category: 'Almacén',
            barcode: '7790000000012',
            salePriceCents: '450000',
            initialStock: '12.5',
          },
        },
      ],
    });
  });

  it('parses a valid XLSX sheet using reasonable English aliases', async () => {
    const result = await parseProductImportFile(
      await xlsxFile([
        ['Product', 'Category', 'SKU', 'Sale price cents', 'Available'],
        ['Café molido', 'Almacén', 'CAF-1', 725000, true],
      ])
    );

    expect(result.format).toBe('xlsx');
    expect(result.headers).toEqual(['name', 'category', 'sku', 'salePriceCents', 'isAvailable']);
    expect(result.rows).toEqual([
      {
        row: 2,
        values: {
          name: 'Café molido',
          category: 'Almacén',
          sku: 'CAF-1',
          salePriceCents: '725000',
          isAvailable: 'true',
        },
      },
    ]);
  });

  it('parses shared strings produced by standard spreadsheet writers', async () => {
    const buffer = zip({
      '[Content_Types].xml': '<Types/>',
      'xl/workbook.xml':
        '<workbook xmlns:r="relationships"><sheets><sheet r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels':
        '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/sharedStrings.xml':
        '<sst><si><t>Nombre</t></si><si><t>Precio de venta centavos</t></si><si><t>Té negro</t></si></sst>',
      'xl/worksheets/sheet1.xml':
        '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>180000</v></c></row></sheetData></worksheet>',
    });

    const result = await parseProductImportFile({
      buffer,
      fileName: 'productos.xlsx',
      mimeType: XLSX_MIME,
    });

    expect(result.rows[0]).toEqual({
      row: 2,
      values: { name: 'Té negro', salePriceCents: '180000' },
    });
  });

  it('rejects extension or MIME claims that do not match the file signature', async () => {
    await expect(
      parseProductImportFile({
        buffer: Buffer.from('not-an-xlsx'),
        fileName: 'productos.xlsx',
        mimeType: XLSX_MIME,
      })
    ).rejects.toSatisfy((error: unknown) => {
      expectParseError(error, 'INVALID_FILE_SIGNATURE');
      return true;
    });

    const xlsx = await xlsxFile([['Nombre'], ['Producto']]);
    await expect(
      parseProductImportFile({ ...xlsx, fileName: 'productos.csv', mimeType: CSV_MIME })
    ).rejects.toSatisfy((error: unknown) => {
      expectParseError(error, 'INVALID_FILE_SIGNATURE');
      return true;
    });
  });

  it('rejects files above 5 MB before parsing', async () => {
    await expect(
      parseProductImportFile({
        buffer: Buffer.alloc(MAX_PRODUCT_IMPORT_BYTES + 1, 65),
        fileName: 'productos.csv',
        mimeType: CSV_MIME,
      })
    ).rejects.toSatisfy((error: unknown) => {
      expectParseError(error, 'FILE_TOO_LARGE');
      return true;
    });
  });

  it('rejects XLSX archives whose declared expanded size exceeds the safe bound', async () => {
    const file = xlsxFile([
      ['Nombre', 'Precio de venta centavos'],
      ['Producto', 1000],
    ]);
    const centralOffset = file.buffer.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    expect(centralOffset).toBeGreaterThanOrEqual(0);
    file.buffer.writeUInt32LE(26 * 1024 * 1024, centralOffset + 24);

    await expect(parseProductImportFile(file)).rejects.toSatisfy((error: unknown) => {
      expectParseError(error, 'UNSAFE_XLSX_ARCHIVE');
      return true;
    });
  });

  it('rejects more than 500 data rows without returning a partial result', async () => {
    const rows = Array.from(
      { length: MAX_PRODUCT_IMPORT_ROWS + 1 },
      (_, index) => `Producto ${index + 1},1000`
    );

    await expect(
      parseProductImportFile(csvFile(`Nombre,Precio de venta centavos\n${rows.join('\n')}`))
    ).rejects.toSatisfy((error: unknown) => {
      expectParseError(error, 'TOO_MANY_ROWS');
      return true;
    });
  });

  it('rejects more than 20 columns and oversized cells', async () => {
    const tooManyHeaders = Array.from(
      { length: MAX_PRODUCT_IMPORT_COLUMNS + 1 },
      (_, index) => `Columna ${index}`
    );
    await expect(
      parseProductImportFile(csvFile(`${tooManyHeaders.join(',')}\n${tooManyHeaders.join(',')}`))
    ).rejects.toSatisfy((error: unknown) => {
      expectParseError(error, 'TOO_MANY_COLUMNS');
      return true;
    });

    await expect(
      parseProductImportFile(csvFile(`Nombre,Precio de venta centavos\n${'a'.repeat(1001)},1000`))
    ).rejects.toSatisfy((error: unknown) => {
      expectParseError(error, 'CELL_TOO_LARGE');
      return true;
    });
  });

  it('rejects unknown, duplicate, and forbidden scope headers deterministically', async () => {
    const cases = [
      ['Nombre,Color', 'UNKNOWN_HEADER'],
      ['Nombre,Producto', 'DUPLICATE_HEADER'],
      ['Nombre,Tenant ID', 'FORBIDDEN_SCOPE_COLUMN'],
      ['Nombre,Ubicación ID', 'FORBIDDEN_SCOPE_COLUMN'],
    ] as const;

    for (const [headers, code] of cases) {
      await expect(parseProductImportFile(csvFile(`${headers}\nProducto,valor`))).rejects.toSatisfy(
        (error: unknown) => {
          expectParseError(error, code);
          return true;
        }
      );
    }
  });

  it('rejects malformed CSV quoting and formula cells', async () => {
    await expect(parseProductImportFile(csvFile('Nombre\n"Producto sin cierre'))).rejects.toSatisfy(
      (error: unknown) => {
        expectParseError(error, 'MALFORMED_CSV');
        return true;
      }
    );

    await expect(
      parseProductImportFile(
        xlsxFile(
          [
            ['Nombre', 'Precio de venta centavos'],
            ['Producto', 1000],
          ],
          'productos.xlsx',
          { row: 2, column: 1 }
        )
      )
    ).rejects.toSatisfy((error: unknown) => {
      expectParseError(error, 'FORMULA_NOT_ALLOWED');
      return true;
    });
  });
});
