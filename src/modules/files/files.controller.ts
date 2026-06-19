import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  ParseUUIDPipe,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { Role } from '@prisma/client';
import { FilesService } from './files.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('files')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('upload/:recordId')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: 'Upload a file to a medical record' })
  upload(
    @Param('recordId', ParseUUIDPipe) recordId: string,
    @UploadedFile() file: any,
    @CurrentUser('id') uploaderId: string,
  ) {
    return this.filesService.upload(file, recordId, uploaderId);
  }

  @Get('record/:recordId')
  @ApiOperation({ summary: 'List files attached to a record' })
  findByRecord(@Param('recordId', ParseUUIDPipe) recordId: string) {
    return this.filesService.findByRecord(recordId);
  }

  @Get(':id/url')
  @ApiOperation({ summary: 'Get a pre-signed download URL for a file' })
  getSignedUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') requesterId: string,
    @CurrentUser('role') requesterRole: Role,
  ) {
    return this.filesService.getSignedUrl(id, requesterId, requesterRole);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download a file — alias for /url (returns pre-signed S3 URL)' })
  download(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') requesterId: string,
    @CurrentUser('role') requesterRole: Role,
  ) {
    return this.filesService.getSignedUrl(id, requesterId, requesterRole);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a file (Admin/Doctor)' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') requesterId: string,
  ) {
    return this.filesService.remove(id, requesterId);
  }
}
