import { v2 as cloudinary } from 'cloudinary';
import { HttpError } from '../lib/http-error.js';

cloudinary.config({ secure: true });

export async function uploadPhoto(buffer: Buffer) {
  try {
    const result = await new Promise<{
      public_id: string;
      secure_url: string;
    }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'stegflow/incidents',
          resource_type: 'image',
          unique_filename: true,
          overwrite: false,
          transformation: [
            {
              width: 2200,
              height: 2200,
              crop: 'limit',
              quality: 'auto:good',
              fetch_format: 'auto',
            },
          ],
        },
        (error, uploaded) => {
          if (error || !uploaded) {
            reject(error ?? new Error('Téléversement Cloudinary incomplet.'));
            return;
          }
          resolve(uploaded);
        },
      );
      stream.end(buffer);
    });
    return {
      bucket: 'cloudinary',
      key: result.public_id,
      url: result.secure_url,
      provider: 'cloudinary',
    };
  } catch (error) {
    console.error('Échec Cloudinary', error);
    throw new HttpError(
      502,
      'La photo ne peut pas être stockée pour le moment. Réessayez dans quelques instants.',
    );
  }
}
