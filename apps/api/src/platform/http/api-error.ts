import { HttpException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';

export class ValidationDetail {
  @ApiProperty() field!: string;
  @ApiProperty({ type: [String] }) rules!: string[];
}
export class ApiErrorResponse {
  @ApiProperty() statusCode!: number;
  @ApiProperty() code!: string;
  @ApiProperty() message!: string;
  @ApiProperty({ type: [ValidationDetail] }) details!: ValidationDetail[];
  @ApiProperty() requestId!: string;
}
export class ApiException extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    readonly safeMessage: string,
    readonly details: ValidationDetail[] = [],
  ) {
    super(safeMessage, status);
  }
}
