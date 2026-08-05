import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../database/entities';
import { TenantService } from './tenant.service';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant])],
  providers: [TenantService],
  exports: [TenantService],
})
export class TenantModule {}
