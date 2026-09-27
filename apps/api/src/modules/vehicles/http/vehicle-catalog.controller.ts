import {
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiExtraModels,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { VehicleCatalog } from '../application/vehicle-catalog';
import { PageQuery } from '../../../platform/http/page.dto';
import { ApiErrorResponse } from '../../../platform/http/api-error';
import {
  RequestRate,
  RequestRateGuard,
} from '../../../platform/http/request-rate.guard';

class CatalogItem {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
}
class ModelItem extends CatalogItem {
  @ApiProperty({ format: 'uuid' }) makeId!: string;
}
class GenerationItem {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ format: 'uuid' }) modelId!: string;
  @ApiProperty() startYear!: number;
  @ApiProperty({ type: Number, nullable: true }) endYear!: number | null;
}
class MakePage {
  @ApiProperty({ type: [CatalogItem] }) items!: CatalogItem[];
  @ApiProperty() limit!: number;
  @ApiProperty() offset!: number;
  @ApiProperty() hasMore!: boolean;
}
class ModelPage {
  @ApiProperty({ type: [ModelItem] }) items!: ModelItem[];
  @ApiProperty() limit!: number;
  @ApiProperty() offset!: number;
  @ApiProperty() hasMore!: boolean;
}
class GenerationPage {
  @ApiProperty({ type: [GenerationItem] }) items!: GenerationItem[];
  @ApiProperty() limit!: number;
  @ApiProperty() offset!: number;
  @ApiProperty() hasMore!: boolean;
}

@Controller({ path: 'catalog', version: '1' })
@ApiExtraModels(PageQuery)
@ApiTags('Vehicle catalog')
@UseGuards(RequestRateGuard)
@ApiResponse({ status: 400, type: ApiErrorResponse })
@ApiResponse({ status: 404, type: ApiErrorResponse })
@ApiResponse({ status: 429, type: ApiErrorResponse })
@ApiResponse({ status: 503, type: ApiErrorResponse })
export class VehicleCatalogController {
  constructor(
    @Inject(VehicleCatalog) private readonly catalog: VehicleCatalog,
  ) {}
  @Get('vehicle-makes')
  @RequestRate('catalog')
  @ApiOkResponse({ type: MakePage })
  makes(@Query() query: PageQuery) {
    return this.catalog.makes(query);
  }
  @Get('vehicle-makes/:makeId/models')
  @RequestRate('catalog')
  @ApiOkResponse({ type: ModelPage })
  models(
    @Param('makeId', ParseUUIDPipe) id: string,
    @Query() query: PageQuery,
  ) {
    return this.catalog.models(id, query);
  }
  @Get('vehicle-models/:modelId/generations')
  @RequestRate('catalog')
  @ApiOkResponse({ type: GenerationPage })
  generations(
    @Param('modelId', ParseUUIDPipe) id: string,
    @Query() query: PageQuery,
  ) {
    return this.catalog.generations(id, query);
  }
}
