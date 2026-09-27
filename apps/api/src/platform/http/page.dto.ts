import { Transform } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PageQuery {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && /^[0-9]{1,5}$/.test(value)
      ? Number(value)
      : value,
  )
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;

  @ApiPropertyOptional({ default: 0, minimum: 0, maximum: 10000 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && /^[0-9]{1,5}$/.test(value)
      ? Number(value)
      : value,
  )
  @IsInt()
  @Min(0)
  @Max(10000)
  offset = 0;
}

export interface Page<T> {
  items: T[];
  limit: number;
  offset: number;
  hasMore: boolean;
}
export function pageOf<T>(rows: T[], query: PageQuery): Page<T> {
  return {
    items: rows.slice(0, query.limit),
    limit: query.limit,
    offset: query.offset,
    hasMore: rows.length > query.limit,
  };
}
