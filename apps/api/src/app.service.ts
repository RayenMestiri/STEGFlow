import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getStatus() {
    return {
      name: 'STEGFlow API',
      status: 'operational',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    };
  }
}
