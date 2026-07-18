import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ExecutionStatus, PrismaClient } from '@prisma/client';
import { Execution, ExecutionRepository } from './execution.types';

@Injectable()
export class PrismaExecutionRepository extends PrismaClient implements ExecutionRepository, OnModuleDestroy {
  async onModuleDestroy() { await this.$disconnect(); }
  async claimNext(assignedTo: string): Promise<Execution | null> {
    // SKIP LOCKED prevents two workers from claiming the same OS concurrently.
    const rows = await this.$queryRaw<Execution[]>`UPDATE executions SET status = 'DIAGNOSING'::"ExecutionStatus", "assignedTo" = ${assignedTo}, "startedAt" = NOW(), "updatedAt" = NOW() WHERE id = (SELECT id FROM executions WHERE status = 'QUEUED'::"ExecutionStatus" ORDER BY priority DESC, "createdAt" ASC FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`;
    return rows[0] ?? null;
  }
  async create(data: { serviceOrderId: string; priority: number }): Promise<Execution> { return this.execution.create({ data }); }
  async findById(id: string): Promise<Execution | null> { return this.execution.findUnique({ where: { id } }); }
  async findByServiceOrderId(serviceOrderId: string): Promise<Execution | null> { return this.execution.findUnique({ where: { serviceOrderId } }); }
  async update(id: string, data: Partial<Pick<Execution, 'status' | 'diagnosis' | 'repairNotes' | 'assignedTo' | 'startedAt' | 'completedAt'>>): Promise<Execution> {
    return this.execution.update({ where: { id }, data: data as { status?: ExecutionStatus } });
  }
}
