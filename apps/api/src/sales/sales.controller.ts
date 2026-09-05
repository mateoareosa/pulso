import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { SalesService } from './sales.service.js';

@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  @HttpCode(200)
  async createSale(@Body() payload: unknown) {
    return await this.salesService.processSale(payload);
  }
}
