import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { productImportCommitSchema } from '@pulso/contracts';
import { FileInterceptor } from '@nestjs/platform-express';
import { SessionAuthGuard } from '../auth/auth.guard.js';
import { CurrentSession } from '../auth/current-session.decorator.js';
import type { SessionContext } from '../auth/cookie.utils.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { MAX_PRODUCT_IMPORT_BYTES } from './product-import.parser.js';
import { ProductImportService } from './product-import.service.js';

interface UploadedImportFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

@Controller('products/import')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('OWNER', 'MANAGER')
export class ProductImportController {
  constructor(@Inject(ProductImportService) private readonly productImport: ProductImportService) {}

  @Post('preview')
  @UseInterceptors(
    FileInterceptor('file', { limits: { files: 1, fileSize: MAX_PRODUCT_IMPORT_BYTES } })
  )
  async preview(
    @UploadedFile() file: UploadedImportFile | undefined,
    @CurrentSession() session: SessionContext
  ) {
    if (!file) throw new BadRequestException('Debe adjuntar un archivo CSV o XLSX');
    return await this.productImport.preview(session, {
      buffer: file.buffer,
      fileName: file.originalname,
      mimeType: file.mimetype,
    });
  }

  @Post('commit')
  async commit(@Body() body: unknown, @CurrentSession() session: SessionContext) {
    const parsed = productImportCommitSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Contrato de confirmación de importación inválido',
        errors: parsed.error.errors,
      });
    }
    return await this.productImport.commit(session, parsed.data.previewToken);
  }
}
