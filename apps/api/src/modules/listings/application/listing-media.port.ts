import { ApiProperty } from '@nestjs/swagger';
import type { EntityManager, ObjectLiteral, SelectQueryBuilder } from 'typeorm';
export class ImageVariantResponse {
  @ApiProperty() url!: string;
  @ApiProperty() width!: number;
  @ApiProperty() height!: number;
}
export class ImageVariantsResponse {
  @ApiProperty({ type: ImageVariantResponse }) thumbnail!: ImageVariantResponse;
  @ApiProperty({ type: ImageVariantResponse }) medium!: ImageVariantResponse;
  @ApiProperty({ type: ImageVariantResponse }) large!: ImageVariantResponse;
}
export class ListingImageResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({
    enum: ['PENDING', 'UPLOADED', 'PROCESSING', 'READY', 'FAILED', 'DELETED'],
  })
  status!: string;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() isPrimary!: boolean;
  @ApiProperty({ type: String, nullable: true }) failureCode!: string | null;
  @ApiProperty({ type: Number, nullable: true }) width!: number | null;
  @ApiProperty({ type: Number, nullable: true }) height!: number | null;
  @ApiProperty({ type: ImageVariantsResponse, nullable: true })
  variants!: ImageVariantsResponse | null;
}
/** Listing-owned contract, implemented and wired by the composition root. */
export abstract class ListingMediaPort {
  abstract attachReadyPrimary<T extends ObjectLiteral>(
    query: SelectQueryBuilder<T>,
  ): void;
  abstract readMany(
    ids: string[],
    manager: EntityManager,
    owner?: boolean,
    coverOnly?: boolean,
  ): Promise<Map<string, ListingImageResponse[]>>;
  abstract assertSubmissionReady(
    id: string,
    manager: EntityManager,
  ): Promise<void>;
}
