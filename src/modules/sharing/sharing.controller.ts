import { Controller, Get, Post, Patch, Param, Body, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SharingService } from './sharing.service';
import { CreateShareLinkDto, CreateShareGrantDto } from './dto/create-share-link.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('share')
@Controller('share')
export class SharingController {
  constructor(private readonly sharingService: SharingService) {}

  // ─── Share Links ───────────────────────────────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('links')
  @ApiOperation({ summary: 'Generate a shareable link (Patient only)' })
  createLink(@CurrentUser('id') requesterId: string, @Body() dto: CreateShareLinkDto) {
    return this.sharingService.createLink(requesterId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('links')
  @ApiOperation({ summary: 'List my share links' })
  getMyLinks(@CurrentUser('id') requesterId: string) {
    return this.sharingService.getMyLinks(requesterId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch('links/:id/revoke')
  @ApiOperation({ summary: 'Revoke a share link' })
  revokeLink(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') requesterId: string,
  ) {
    return this.sharingService.revokeLink(id, requesterId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('links/:id/qr')
  @ApiOperation({ summary: 'Get QR code for a share link (Patient only)' })
  getLinkQr(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') requesterId: string,
  ) {
    return this.sharingService.getShareLinkQr(id, requesterId);
  }

  @Public()
  @Get('resolve/:token')
  @ApiOperation({ summary: 'Resolve shared token — returns scoped patient data (no auth)' })
  resolveToken(@Param('token') token: string) {
    return this.sharingService.resolveToken(token);
  }

  // ─── Share Grants ──────────────────────────────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('grants')
  @ApiOperation({ summary: 'Grant record access to a specific user by email (Patient only)' })
  createGrant(@CurrentUser('id') requesterId: string, @Body() dto: CreateShareGrantDto) {
    return this.sharingService.createGrant(requesterId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('grants')
  @ApiOperation({ summary: 'List my access grants' })
  getMyGrants(@CurrentUser('id') requesterId: string) {
    return this.sharingService.getMyGrants(requesterId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch('grants/:id/revoke')
  @ApiOperation({ summary: 'Revoke an access grant' })
  revokeGrant(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') requesterId: string,
  ) {
    return this.sharingService.revokeGrant(id, requesterId);
  }
}
