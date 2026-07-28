import type { ErrorRequestHandler, RequestHandler } from 'express';
import multer from 'multer';
import { Error as MongooseError } from 'mongoose';
import { ZodError } from 'zod';
import { HttpError } from '../lib/http-error.js';

export const notFoundHandler: RequestHandler = (request, _response, next) => {
  next(new HttpError(404, `Route introuvable : ${request.method} ${request.path}`));
};

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _request,
  response,
  _next,
) => {
  if (error instanceof ZodError) {
    response.status(400).json({
      statusCode: 400,
      error: 'Bad Request',
      message: error.issues.map((issue) => issue.message).join(' '),
      details: error.flatten(),
    });
    return;
  }

  if (error instanceof multer.MulterError) {
    response.status(400).json({
      statusCode: 400,
      error: 'Bad Request',
      message:
        error.code === 'LIMIT_FILE_SIZE'
          ? 'Une image de moins de 8 Mo est requise.'
          : error.message,
    });
    return;
  }

  if (error instanceof MongooseError.ValidationError) {
    response.status(400).json({
      statusCode: 400,
      error: 'Bad Request',
      message: Object.values(error.errors)
        .map((item) => item.message)
        .join(' '),
    });
    return;
  }

  const mongoError = error as { code?: number };
  if (mongoError?.code === 11000) {
    response.status(409).json({
      statusCode: 409,
      error: 'Conflict',
      message: 'Cette ressource existe déjà.',
    });
    return;
  }

  if (error instanceof HttpError) {
    response.status(error.statusCode).json({
      statusCode: error.statusCode,
      error: error.statusCode >= 500 ? 'Internal Server Error' : 'Request Error',
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    });
    return;
  }

  console.error(error);
  response.status(500).json({
    statusCode: 500,
    error: 'Internal Server Error',
    message: 'Une erreur interne est survenue.',
  });
};
