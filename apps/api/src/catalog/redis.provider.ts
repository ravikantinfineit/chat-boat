import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

export const redisProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService) =>
    new Redis(config.getOrThrow<string>('redis.url'), {
      maxRetriesPerRequest: null,
      lazyConnect: false,
    }),
};
