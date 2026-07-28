import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MediaService } from './media.service';

@ApiTags('media')
@ApiBearerAuth()
@Controller('media')
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('photos')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Stocker une preuve photo dans Cloudinary ou S3' })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 8 * 1024 * 1024 },
      fileFilter: (_request, file, callback) =>
        callback(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)),
    }),
  )
  uploadPhoto(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Une image JPEG, PNG ou WebP de moins de 8 Mo est requise.');
    }
    return this.media.upload(file.buffer, file.mimetype);
  }
}
