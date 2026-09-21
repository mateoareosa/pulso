import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CategoriesController } from './categories.controller.js';
import { CategoriesService } from './categories.service.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';
import { ProductImportParser } from './product-import.parser.js';
import { ProductImportController } from './product-import.controller.js';
import { PRODUCT_IMPORT_PREVIEW_SECRET, ProductImportService } from './product-import.service.js';

function productImportPreviewSecret(): string {
  const secret = process.env.PRODUCT_IMPORT_PREVIEW_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('PRODUCT_IMPORT_PREVIEW_SECRET is required and must contain at least 32 bytes');
  }
  return secret;
}

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [CategoriesController, ProductsController, ProductImportController],
  providers: [
    CategoriesService,
    ProductsService,
    ProductImportParser,
    ProductImportService,
    { provide: PRODUCT_IMPORT_PREVIEW_SECRET, useFactory: productImportPreviewSecret },
  ],
  exports: [CategoriesService, ProductsService, ProductImportParser, ProductImportService],
})
export class CatalogModule {}
