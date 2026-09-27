import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponse } from '../../../platform/http/api-error';
import {
  RequestRate,
  RequestRateGuard,
} from '../../../platform/http/request-rate.guard';
import {
  AuthenticationGuard,
  CurrentPrincipal,
  RequireRoles,
  RolesGuard,
  type AuthenticatedPrincipal,
} from '../../auth';
import { AdminService } from '../application/admin.service';
import {
  AdminAuditQuery,
  AdminUsersQuery,
  ReplaceRolesInput,
  UserStatusActionInput,
} from './admin.dto';

@Controller({ path: 'admin', version: '1' })
@ApiTags('Administration')
@ApiBearerAuth()
@ApiExtraModels(
  AdminUsersQuery,
  AdminAuditQuery,
  UserStatusActionInput,
  ReplaceRolesInput,
)
@RequireRoles('ADMIN')
@UseGuards(AuthenticationGuard, RolesGuard, RequestRateGuard)
@ApiResponse({ status: 400, type: ApiErrorResponse })
@ApiResponse({ status: 401, type: ApiErrorResponse })
@ApiResponse({ status: 403, type: ApiErrorResponse })
@ApiResponse({ status: 409, type: ApiErrorResponse })
export class AdminController {
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}

  @Get('users')
  @RequestRate('adminRead')
  @ApiOperation({
    summary: 'Bounded exact-filter administrative user directory',
  })
  @ApiOkResponse({ description: 'Cursor-paginated safe account summaries.' })
  users(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: AdminUsersQuery,
  ) {
    return this.admin.listUsers(principal, query);
  }

  @Get('users/:id')
  @RequestRate('adminRead')
  @ApiOkResponse({
    description: 'Safe account detail without credentials or token digests.',
  })
  user(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.admin.userDetail(principal, id);
  }

  @Post('users/:id/suspend')
  @HttpCode(200)
  @RequestRate('adminWrite')
  @ApiBody({ type: UserStatusActionInput })
  suspend(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UserStatusActionInput,
  ) {
    return this.admin.statusAction(principal, id, 'suspend', input);
  }

  @Post('users/:id/block')
  @HttpCode(200)
  @RequestRate('adminWrite')
  @ApiBody({ type: UserStatusActionInput })
  block(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UserStatusActionInput,
  ) {
    return this.admin.statusAction(principal, id, 'block', input);
  }

  @Post('users/:id/reactivate')
  @HttpCode(200)
  @RequestRate('adminWrite')
  @ApiBody({ type: UserStatusActionInput })
  reactivate(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UserStatusActionInput,
  ) {
    return this.admin.statusAction(principal, id, 'reactivate', input);
  }

  @Put('users/:id/roles')
  @RequestRate('adminWrite')
  @ApiBody({ type: ReplaceRolesInput })
  @ApiOkResponse({
    description:
      'Replaces the fixed role set with expected-current concurrency protection.',
  })
  roles(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ReplaceRolesInput,
  ) {
    return this.admin.replaceRoles(principal, id, input);
  }

  @Get('audit')
  @RequestRate('adminRead')
  @ApiOkResponse({
    description:
      'Append-only safe audit projection with signed cursor pagination.',
  })
  audit(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: AdminAuditQuery,
  ) {
    return this.admin.audit(principal, query);
  }
}
