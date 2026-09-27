import {
  applyDecorators,
  Controller,
  Get,
  Inject,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOkResponse,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiErrorResponse } from '../../../platform/http/api-error';
import {
  RequestRate,
  RequestRateGuard,
} from '../../../platform/http/request-rate.guard';
import { ListingSearch } from '../application/listing-search';
import { parseSearchQuery, SEARCH_SORTS } from '../domain/search-query';
import { parseMapQuery } from '../domain/map-query';
import { SearchResponse, MapResponse, FacetResponse } from './search.dto';
import {
  VehicleSearchItem,
  PartSearchItem,
  VehicleMapItem,
  PartMapItem,
  VehicleFacets,
  PartFacets,
  ClusterMapFeature,
} from './search.dto';
import {
  BODY_TYPES,
  FUEL_TYPES,
  TRANSMISSIONS,
  DRIVE_TYPES,
  VEHICLE_CONDITIONS,
  VEHICLE_COLORS,
} from '../../vehicles';
import { FITMENT_MODES, PART_CONDITIONS } from '../../parts';
import { SUPPORTED_CURRENCIES } from '../../listings';

function SearchParameters(mode: 'list' | 'map' | 'facets') {
  return applyDecorators(
    ApiQuery({
      name: 'type',
      required: false,
      enum: ['VEHICLE', 'PART'],
      description:
        'Marketplace subtype. Omitted temporarily means VEHICLE for backward compatibility.',
    }),
    ...['makeId', 'modelId', 'generationId'].map((name) =>
      ApiQuery({
        name,
        required: false,
        schema: { type: 'string', format: 'uuid' },
        description:
          'Unknown/inconsistent catalog relationships produce zero matches.',
      }),
    ),
    ...['yearFrom', 'yearTo', 'mileageFrom', 'mileageTo'].map((name) =>
      ApiQuery({
        name,
        required: false,
        type: Number,
        description: 'Canonical integer. Inclusive range; from <= to.',
      }),
    ),
    ...['priceFromMinor', 'priceToMinor'].map((name) =>
      ApiQuery({
        name,
        required: false,
        type: String,
        description: 'Canonical int64 minor-unit string. Requires currency.',
      }),
    ),
    ApiQuery({
      name: 'currency',
      required: false,
      enum: SUPPORTED_CURRENCIES,
      description:
        'Required for price ranges and price sorting; no conversion.',
    }),
    ...Object.entries({
      bodyType: BODY_TYPES,
      fuelType: FUEL_TYPES,
      transmission: TRANSMISSIONS,
      driveType: DRIVE_TYPES,
      color: VEHICLE_COLORS,
    }).map(([name, values]) =>
      ApiQuery({
        name,
        required: false,
        type: String,
        description: `Comma-separated unique values, at most 8; no repeated parameters. Allowed: ${values.join(', ')}.`,
      }),
    ),
    ...[
      'categoryId',
      'brandId',
      'compatibleMakeId',
      'compatibleModelId',
      'compatibleGenerationId',
    ].map((name) =>
      ApiQuery({
        name,
        required: false,
        schema: { type: 'string', format: 'uuid' },
        description: 'PART only. Structured catalog identifier.',
      }),
    ),
    ApiQuery({
      name: 'includeSubcategories',
      required: false,
      enum: ['true', 'false'],
      description:
        'PART category subtree policy. Defaults true; recursive traversal is bounded and cycle-safe.',
    }),
    ApiQuery({
      name: 'condition',
      required: false,
      type: String,
      description: `Comma-separated subtype values, at most 8. VEHICLE: ${VEHICLE_CONDITIONS.join(', ')}; PART: ${PART_CONDITIONS.join(', ')}.`,
    }),
    ...['oemNumber', 'manufacturerPartNumber', 'partNumber'].map((name) =>
      ApiQuery({
        name,
        required: false,
        type: String,
        description:
          'PART only. Exact normalized identifier, maximum 100 characters. partNumber matches OEM or manufacturer number.',
      }),
    ),
    ApiQuery({
      name: 'compatibleYear',
      required: false,
      type: Number,
      description: 'PART only. Inclusive fitment year in range 1886–2100.',
    }),
    ApiQuery({
      name: 'fitmentMode',
      required: false,
      type: String,
      description: `PART only. Comma-separated values: ${FITMENT_MODES.join(', ')}.`,
    }),
    ApiQuery({
      name: 'includeUniversal',
      required: false,
      enum: ['true', 'false'],
      description:
        'PART compatibility searches include UNIVERSAL parts by default.',
    }),
    ApiQuery({
      name: 'sort',
      required: false,
      enum: SEARCH_SORTS,
      description:
        'Default newest. price/distance apply to both types. mileage/year are VEHICLE-only and rejected for PART. Price requires currency; distance requires lat/lng.',
    }),
    ApiQuery({
      name: 'bbox',
      required: false,
      type: String,
      description:
        mode === 'map'
          ? 'Optional search-area filter evaluated with the private exact point. A lone bbox is a deprecated viewport alias when viewport and radius origin are absent.'
          : 'west,south,east,north; inclusive SRID4326 search envelope, antimeridian supported (west>east).',
    }),
    ...[
      ApiQuery({
        name: 'lat',
        required: false,
        type: Number,
        description:
          'Origin latitude [-90,90], up to 8 decimal places. Requires lng. Conflicts with bbox.',
      }),
      ApiQuery({
        name: 'lng',
        required: false,
        type: Number,
        description: 'Origin longitude [-180,180]. Requires lat.',
      }),
      ApiQuery({
        name: 'radiusMeters',
        required: false,
        type: Number,
        description:
          'Integer 1–250000 metres. Requires lat/lng. Without radius, lat/lng supports global nearest.',
      }),
    ],
    ...(mode === 'map'
      ? [
          ApiQuery({
            name: 'viewport',
            required: false,
            type: String,
            description:
              'Visible public map bounds west,south,east,north. Required for new clients and independent from bbox/radius filters. Antimeridian crossing uses west > east.',
          }),
          ApiQuery({
            name: 'zoom',
            required: false,
            type: Number,
            description:
              'MapLibre zoom 0–22 with up to two decimals; defaults to 10 for legacy clients. The integer bucket controls the global Web Mercator grid.',
          }),
        ]
      : []),
    ApiQuery({
      name: 'limit',
      required: false,
      type: Number,
      description:
        mode === 'map'
          ? 'Default and maximum 500 features after server clustering. Response indicates truncation.'
          : 'Default 20, maximum 50. Facets ignore page limit, at most 100 buckets.',
    }),
    ...(mode === 'list'
      ? [
          ApiQuery({
            name: 'cursor',
            required: false,
            type: String,
            description:
              'Opaque AES-GCM cursor bound to schema v2 type, filters, sort and geo. Limit may change. 24-hour expiry.',
          }),
        ]
      : []),
  );
}
@Controller({ version: '1' })
@ApiTags('Search and Geo')
@ApiExtraModels(
  VehicleSearchItem,
  PartSearchItem,
  VehicleMapItem,
  PartMapItem,
  ClusterMapFeature,
  VehicleFacets,
  PartFacets,
)
@UseGuards(RequestRateGuard)
@ApiResponse({
  status: 400,
  type: ApiErrorResponse,
  description:
    'SEARCH_INVALID_FILTER, SEARCH_FILTER_NOT_SUPPORTED, VALIDATION_ERROR (SEARCH_INVALID_RANGE), SEARCH_INVALID_CURSOR, SEARCH_CURSOR_QUERY_MISMATCH, SEARCH_INVALID_SORT, SEARCH_SORT_NOT_SUPPORTED, SEARCH_LOCATION_REQUIRED, GEO_INVALID_COORDINATES, GEO_INVALID_BBOX, GEO_INVALID_RADIUS, GEO_CONFLICTING_FILTERS, MAP_INVALID_VIEWPORT, MAP_INVALID_ZOOM.',
})
@ApiResponse({ status: 429, type: ApiErrorResponse })
@ApiResponse({ status: 503, type: ApiErrorResponse })
export class SearchController {
  constructor(@Inject(ListingSearch) private readonly search: ListingSearch) {}
  @Get('listings')
  @RequestRate('search')
  @SearchParameters('list')
  @ApiOkResponse({
    type: SearchResponse,
    description:
      'Unified discriminated VEHICLE/PART result. PUBLISHED with valid subtype data and READY primary variants. Vehicle location is required; Parts may omit location outside geo modes. Compact projection, no total count or sensitive fields.',
  })
  list(
    @Query() query: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.search.search(parseSearchQuery(query));
  }
  @Get('search/listings/map')
  @RequestRate('searchMap')
  @SearchParameters('map')
  @ApiOkResponse({ type: MapResponse })
  map(@Query() query: unknown, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    const parsed = parseMapQuery(query);
    if (parsed.legacyBboxAlias) response.setHeader('Deprecation', 'true');
    return this.search.markers(parsed);
  }
  @Get('search/listings/facets')
  @RequestRate('searchFacets')
  @SearchParameters('facets')
  @ApiOkResponse({
    type: FacetResponse,
    description:
      'Counts after all filters, no self exclusion; bounded to top 100 total buckets. Exact aggregation is separately rate-limited.',
  })
  facets(
    @Query() query: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.search.facets(parseSearchQuery(query, 'facets'));
  }
}
