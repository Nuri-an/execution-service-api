import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AUDIT_LOG, AuditLog, EXECUTION_REPOSITORY, Execution, ExecutionRepository, ExecutionStatus, SAGA_EVENT_PUBLISHER, SagaEventPublisher } from './execution.types';

const transitions: Record<ExecutionStatus, ExecutionStatus[]> = {
  QUEUED: ['DIAGNOSING', 'CANCELLED'], DIAGNOSING: ['REPAIRING', 'CANCELLED'],
  REPAIRING: ['COMPLETED', 'CANCELLED'], COMPLETED: [], CANCELLED: [],
};

@Injectable()
export class ExecutionService {
  constructor(
    @Inject(EXECUTION_REPOSITORY) private readonly repository: ExecutionRepository,
    @Inject(AUDIT_LOG) private readonly auditLog: AuditLog,
    @Inject(SAGA_EVENT_PUBLISHER) private readonly eventPublisher: SagaEventPublisher,
  ) {}

  async enqueue(serviceOrderId: string, priority = 0): Promise<Execution> {
    if (await this.repository.findByServiceOrderId(serviceOrderId)) throw new ConflictException('Service order is already queued');
    const execution = await this.repository.create({ serviceOrderId, priority });
    await this.auditLog.write('EXECUTION_QUEUED', execution);
    await this.eventPublisher.publish('execution.queued', this.eventPayload(execution));
    return execution;
  }

  async claimNext(assignedTo: string): Promise<Execution> {
    const execution = await this.repository.claimNext(assignedTo);
    if (!execution) throw new NotFoundException('No service order is waiting in queue');
    await this.auditLog.write('EXECUTION_CLAIMED', execution);
    return execution;
  }

  async updateStatus(id: string, status: ExecutionStatus, notes?: { diagnosis?: string; repairNotes?: string }): Promise<Execution> {
    const current = await this.repository.findById(id);
    if (!current) throw new NotFoundException('Execution not found');
    if (!transitions[current.status].includes(status)) throw new BadRequestException(`Invalid transition from ${current.status} to ${status}`);
    if (status === 'REPAIRING' && !notes?.diagnosis && !current.diagnosis) throw new BadRequestException('A diagnosis is required before repair');
    const data = { status, diagnosis: notes?.diagnosis, repairNotes: notes?.repairNotes, completedAt: status === 'COMPLETED' ? new Date() : undefined };
    const execution = await this.repository.update(id, data);
    await this.auditLog.write(`EXECUTION_${status}`, execution);
    if (status === 'COMPLETED') await this.publishCompletion(execution);
    return execution;
  }

  async compensate(serviceOrderId: string, reason: string): Promise<Execution | null> {
    const current = await this.repository.findByServiceOrderId(serviceOrderId);
    if (!current || current.status === 'COMPLETED' || current.status === 'CANCELLED') return null;
    const execution = await this.repository.update(current.id, { status: 'CANCELLED' });
    await this.auditLog.write('EXECUTION_CANCELLED', execution, { reason, compensated: true });
    await this.eventPublisher.publish('execution.cancelled', { ...this.eventPayload(execution), reason });
    return execution;
  }

  private async publishCompletion(execution: Execution) {
    await this.eventPublisher.publish('execution.completed', this.eventPayload(execution));
    await this.auditLog.write('EXECUTION_COMPLETION_PUBLISHED', execution);
  }
  private eventPayload(execution: Execution): Record<string, unknown> { return { executionId: execution.id, serviceOrderId: execution.serviceOrderId, status: execution.status, completedAt: execution.completedAt, repairNotes: execution.repairNotes }; }
  async get(id: string) { const execution = await this.repository.findById(id); if (!execution) throw new NotFoundException('Execution not found'); return execution; }
}
