import { Router } from 'express';
import multer from 'multer';
import { HttpError } from '../lib/http-error.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadPhoto } from '../services/media.service.js';

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    callback(null, allowedMimeTypes.has(file.mimetype));
  },
});

export const mediaRouter = Router();

mediaRouter.post(
  '/photos',
  requireAuth,
  upload.single('file'),
  async (request, response) => {
    if (!request.file) {
      throw new HttpError(
        400,
        'Une image JPEG, PNG ou WebP de moins de 8 Mo est requise.',
      );
    }
    response.status(201).json(await uploadPhoto(request.file.buffer));
  },
);
