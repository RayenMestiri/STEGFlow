import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('should expose an operational API status', () => {
      expect(appController.getHealth()).toMatchObject({
        name: 'STEGFlow API',
        status: 'operational',
        version: '1.0.0',
      });
    });
  });
});
