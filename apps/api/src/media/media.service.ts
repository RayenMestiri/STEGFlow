import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse, UploadApiErrorResponse } from 'cloudinary';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly s3Client: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;
  private readonly serverSideEncryption?: 'AES256' | 'aws:kms';

  constructor(private readonly config: ConfigService) {
    const cloudName = this.config.getOrThrow<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.config.getOrThrow<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.config.getOrThrow<string>('CLOUDINARY_API_SECRET');

    this.bucket = config.get('S3_BUCKET', 'stegflow-media');
    this.publicUrl = config.get('S3_PUBLIC_URL', 'http://localhost:9000');

    // Cloudinary SDK Configuration
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });

    this.logger.log(`MediaService initialisé avec Cloudinary (Cloud Name: ${cloudName})`);

    const encryption = config
      .get<string>('S3_SERVER_SIDE_ENCRYPTION', '')
      .trim();
    this.serverSideEncryption =
      encryption === 'AES256' || encryption === 'aws:kms'
        ? encryption
        : undefined;

    this.s3Client = new S3Client({
      region: config.get('S3_REGION', 'us-east-1'),
      endpoint: config.get('S3_ENDPOINT', 'http://localhost:9000'),
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.get('S3_ACCESS_KEY', 'stegflow'),
        secretAccessKey: config.get('S3_SECRET_KEY', 'stegflow_dev_secret'),
      },
    });
  }

  async upload(buffer: Buffer, mimeType: string, prefix = 'incidents') {
    try {
      return await this.uploadToCloudinary(buffer, prefix);
    } catch (err) {
      console.error('CLOUDINARY ERROR DETAILS:', err);
      this.logger.warn(
        `Échec d'upload Cloudinary, basculement vers S3: ${(err as Error).message}`,
      );
      return this.uploadToS3(buffer, mimeType, prefix);
    }
  }

  private uploadToCloudinary(
    buffer: Buffer,
    prefix: string,
  ): Promise<{ bucket: string; key: string; url: string; provider: string }> {
    return new Promise((resolve, reject) => {
      const folder = `stegflow/${prefix}`;
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'auto',
          unique_filename: true,
        },
        (error: UploadApiErrorResponse | undefined, result: UploadApiResponse | undefined) => {
          if (error || !result) {
            return reject(error ?? new Error('Échec du téléversement Cloudinary'));
          }
          resolve({
            bucket: 'cloudinary',
            key: result.public_id,
            url: result.secure_url,
            provider: 'cloudinary',
          });
        },
      );

      Readable.from(buffer).pipe(uploadStream);
    });
  }

  private async uploadToS3(buffer: Buffer, mimeType: string, prefix: string) {
    const key = `${prefix}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}`;
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        ...(this.serverSideEncryption
          ? { ServerSideEncryption: this.serverSideEncryption }
          : {}),
      }),
    );
    return {
      bucket: this.bucket,
      key,
      url: encodeURI(`${this.publicUrl}/${this.bucket}/${key}`),
      provider: 's3',
    };
  }
}
