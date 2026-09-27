import { Test, TestingModule } from '@nestjs/testing';
import { AppService } from './app.service';

describe('AppService', () => {
  let service: AppService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AppService],
    }).compile();

    service = module.get<AppService>(AppService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return health status', () => {
    const result = service.getHealth();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('CalAssist');
  });

  it('should return status with phases', () => {
    const result = service.getStatus();
    expect(result.status).toBe('operational');
    expect(result.version).toBe('1.0.0');
  });
});
