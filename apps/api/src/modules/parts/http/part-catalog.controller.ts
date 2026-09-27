import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PageQuery } from '../../../platform/http/page.dto';
import { ApiErrorResponse } from '../../../platform/http/api-error';
import {
  RequestRate,
  RequestRateGuard,
} from '../../../platform/http/request-rate.guard';
import { PartCatalog } from '../application/part-catalog';

export class PartCategoryResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) parentId!:
    string | null;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiPropertyOptional() sortOrder?: number;
}
export class PartBrandResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
}
class PartCategoryPage {
  @ApiProperty({ type: [PartCategoryResponse] }) items!: PartCategoryResponse[];
  @ApiProperty() limit!: number;
  @ApiProperty() offset!: number;
  @ApiProperty() hasMore!: boolean;
}
class PartBrandPage {
  @ApiProperty({ type: [PartBrandResponse] }) items!: PartBrandResponse[];
  @ApiProperty() limit!: number;
  @ApiProperty() offset!: number;
  @ApiProperty() hasMore!: boolean;
}
@Controller({ path: 'catalog', version: '1' })
@ApiTags('Part Catalog')
@ApiExtraModels(PageQuery)
@UseGuards(RequestRateGuard)
@ApiResponse({ status: 400, type: ApiErrorResponse })
@ApiResponse({ status: 429, type: ApiErrorResponse })
@ApiResponse({ status: 503, type: ApiErrorResponse })
export class PartCatalogController {
  constructor(@Inject(PartCatalog) private readonly catalog: PartCatalog) {}
  @Get('part-categories')
  @RequestRate('catalog')
  @ApiOkResponse({
    type: PartCategoryPage,
    description:
      'Active adjacency categories, ordered sortOrder/name/id; bounded pagination.',
  })
  categories(@Query() query: PageQuery) {
    return this.catalog.categories(query);
  }
  @Get('part-brands')
  @RequestRate('catalog')
  @ApiOkResponse({
    type: PartBrandPage,
    description: 'Active brands ordered name/id; bounded pagination.',
  })
  brands(@Query() query: PageQuery) {
    return this.catalog.brands(query);
  }
}
