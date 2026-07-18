import { Module } from '@nestjs/common';
import { ExecutionModule } from './execution/execution.module';
import { HealthController } from './health.controller';

@Module({ imports: [ExecutionModule], controllers: [HealthController] })
export class AppModule {}
