import { Module } from '@nestjs/common';
import { ExecutionController } from './execution.controller';
import { ExecutionService } from './execution.service';
import { AUDIT_LOG, EXECUTION_REPOSITORY } from './execution.types';
import { PrismaExecutionRepository } from './prisma-execution.repository';
import { MongoAuditLogService } from './mongo-audit-log.service';
import { RabbitMqEventBus, RabbitMqSagaConsumer } from './rabbitmq-saga.service';
import { OutboxRelayService } from './outbox-relay.service';
@Module({ controllers: [ExecutionController], providers: [ExecutionService, PrismaExecutionRepository, RabbitMqEventBus, RabbitMqSagaConsumer, OutboxRelayService, { provide: EXECUTION_REPOSITORY, useExisting: PrismaExecutionRepository }, { provide: AUDIT_LOG, useClass: MongoAuditLogService }] })
export class ExecutionModule {}
