import { Module } from '@nestjs/common';
import { ExecutionController } from './execution.controller';
import { ExecutionService } from './execution.service';
import { AUDIT_LOG, EXECUTION_REPOSITORY, SAGA_EVENT_PUBLISHER } from './execution.types';
import { PrismaExecutionRepository } from './prisma-execution.repository';
import { MongoAuditLogService } from './mongo-audit-log.service';
import { RabbitMqEventBus, RabbitMqSagaConsumer } from './rabbitmq-saga.service';
@Module({ controllers: [ExecutionController], providers: [ExecutionService, RabbitMqEventBus, RabbitMqSagaConsumer, { provide: EXECUTION_REPOSITORY, useClass: PrismaExecutionRepository }, { provide: AUDIT_LOG, useClass: MongoAuditLogService }, { provide: SAGA_EVENT_PUBLISHER, useExisting: RabbitMqEventBus }] })
export class ExecutionModule {}
