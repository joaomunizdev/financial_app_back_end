import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ImportsService } from '../../application/services/imports.service';
import { JwtAuthGuard, ReqUser } from '../security/jwt.guard';
import { ConfirmImportDto, PreviewImportDto } from '../dtos/import.dto';

const MAX_FILE_BYTES = 5 * 1024 * 1024;

@ApiTags('imports')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller('imports')
export class ImportsController {
  constructor(private readonly service: ImportsService) {}

  @Post('preview')
  @ApiConsumes('multipart/form-data')
  @ApiOkResponse({
    description:
      'Reads an OFX/CSV/PDF statement or invoice (bank detected from the content) and returns the lines with suggested action, category and duplicate status. Nothing is saved. 422 for unknown/unsupported files.',
  })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1 } }))
  preview(
    @ReqUser() user: any,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: PreviewImportDto,
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('file is required');
    // The uploaded file is only read in memory; it is never stored.
    return this.service.preview(user.userId, dto.kind, file.buffer, dto.creditCardId);
  }

  @Post('confirm')
  @ApiCreatedResponse({ description: 'Creates the confirmed lines: { purchases, incomes, skipped }' })
  confirm(@ReqUser() user: any, @Body() dto: ConfirmImportDto) {
    return this.service.confirm(user.userId, dto);
  }
}
