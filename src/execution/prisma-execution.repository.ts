import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ExecutionStatus, PrismaClient } from '@prisma/client';
import { Execution, ExecutionRepository, OutboxDefinition, OutboxEvent } from './execution.types';

@Injectable()
export class PrismaExecutionRepository extends PrismaClient implements ExecutionRepository, OnModuleDestroy {
  async onModuleDestroy() { await this.$disconnect(); }
  async claimNext(assignedTo: string): Promise<Execution | null> {
    // SKIP LOCKED prevents two workers from claiming the same OS concurrently.
    const rows = await this.$queryRaw<Execution[]>`UPDATE executions SET status = 'DIAGNOSING'::"ExecutionStatus", "assignedTo" = ${assignedTo}, "startedAt" = NOW(), "updatedAt" = NOW() WHERE id = (SELECT id FROM executions WHERE status = 'QUEUED'::"ExecutionStatus" ORDER BY priority DESC, "createdAt" ASC FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`;
    return rows[0] ?? null;
  }
  async create(data: { serviceOrderId: string; priority: number }): Promise<Execution> { return this.execution.create({ data }); }
  async createWithOutbox(data: { serviceOrderId: string; priority: number }, event: OutboxDefinition): Promise<Execution> {
    return this.$transaction(async (tx) => {
      const execution = await tx.execution.create({ data });
      await tx.outboxEvent.create({ data: { eventType: event.eventType, payload: event.payload(execution) } });
      return execution;
    });
  }
  async findById(id: string): Promise<Execution | null> { return this.execution.findUnique({ where: { id } }); }
  async findByServiceOrderId(serviceOrderId: string): Promise<Execution | null> { return this.execution.findUnique({ where: { serviceOrderId } }); }
  async update(id: string, data: Partial<Pick<Execution, 'status' | 'diagnosis' | 'repairNotes' | 'assignedTo' | 'startedAt' | 'completedAt'>>): Promise<Execution> {
    return this.execution.update({ where: { id }, data: data as { status?: ExecutionStatus } });
  }
  async updateWithOutbox(id: string, data: Partial<Pick<Execution, 'status' | 'diagnosis' | 'repairNotes' | 'assignedTo' | 'startedAt' | 'completedAt'>>, event: OutboxDefinition): Promise<Execution> {
    return this.$transaction(async (tx) => {
      const execution = await tx.execution.update({ where: { id }, data: data as { status?: ExecutionStatus } });
      await tx.outboxEvent.create({ data: { eventType: event.eventType, payload: event.payload(execution) } });
      return execution;
    });
  }
  async claimPendingOutbox(limit: number): Promise<OutboxEvent[]> {
    return this.$queryRaw<OutboxEvent[]>`UPDATE "outbox_events" SET "status" = 'PUBLISHING'::"OutboxStatus", "attempts" = "attempts" + 1, "lockedAt" = NOW() WHERE "id" IN (SELECT "id" FROM "outbox_events" WHERE "status" = 'PENDING'::"OutboxStatus" OR ("status" = 'PUBLISHING'::"OutboxStatus" AND "lockedAt" < NOW() - INTERVAL '1 minute') ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT ${limit}) RETURNING "id", "eventType", "payload", "attempts", "createdAt"`;
  }
  async markOutboxPublished(id: string): Promise<void> { await this.outboxEvent.update({ where: { id }, data: { status: 'PUBLISHED', publishedAt: new Date(), lockedAt: null } }); }
  async releaseOutbox(id: string): Promise<void> { await this.outboxEvent.update({ where: { id }, data: { status: 'PENDING', lockedAt: null } }); }
}
