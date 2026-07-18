import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ExecutionService } from './execution.service';
import { Execution, ExecutionRepository } from './execution.types';
const execution = (status: Execution['status'] = 'QUEUED'): Execution => ({ id: 'execution-1', serviceOrderId: 'order-1', priority: 0, status, createdAt: new Date(), updatedAt: new Date() });
describe('ExecutionService', () => {
  let repository: jest.Mocked<ExecutionRepository>; let audit: { write: jest.Mock }; let service: ExecutionService;
  beforeEach(() => {
    repository = {
      create: jest.fn(),
      createWithOutbox: jest.fn(async (data, event) => {
        const result = execution();
        event.payload(result);
        return result;
      }),
      findById: jest.fn(),
      findByServiceOrderId: jest.fn(),
      claimNext: jest.fn(),
      update: jest.fn(),
      updateWithOutbox: jest.fn(async (id, data, event) => {
        const result = execution(data.status === 'CANCELLED' ? 'CANCELLED' : 'COMPLETED');
        event.payload(result);
        return result;
      }),
      claimPendingOutbox: jest.fn(),
      markOutboxPublished: jest.fn(),
      releaseOutbox: jest.fn(),
    };
    audit = { write: jest.fn() };
    service = new ExecutionService(repository, audit);
  });
  it('queues an OS and persists its event in the outbox', async () => { repository.findByServiceOrderId.mockResolvedValue(null); repository.createWithOutbox.mockResolvedValue(execution()); await expect(service.enqueue('order-1')).resolves.toMatchObject({ status: 'QUEUED' }); expect(repository.createWithOutbox).toHaveBeenCalledWith({ serviceOrderId: 'order-1', priority: 0 }, expect.objectContaining({ eventType: 'execution.queued' })); expect(audit.write).toHaveBeenCalledWith('EXECUTION_QUEUED', expect.anything()); });
  it('generates the queued event payload callback', async () => {
    let capturedPayload: ((execution: Execution) => unknown) | undefined;
    repository.createWithOutbox.mockImplementation(async (_data, event) => {
      capturedPayload = event.payload;
      return execution();
    });
    repository.findByServiceOrderId.mockResolvedValue(null);
    await service.enqueue('order-1');
    expect(capturedPayload).toBeDefined();
    expect(capturedPayload?.(execution())).toEqual({
      executionId: 'execution-1',
      serviceOrderId: 'order-1',
      status: 'QUEUED',
      completedAt: null,
      repairNotes: null,
    });
  });
  it('does not queue an OS twice', async () => { repository.findByServiceOrderId.mockResolvedValue(execution()); await expect(service.enqueue('order-1')).rejects.toBeInstanceOf(ConflictException); });
  it('claims the next order and records the responsible mechanic', async () => { const claimed = { ...execution('DIAGNOSING'), assignedTo: 'mechanic-1', startedAt: new Date() }; repository.claimNext.mockResolvedValue(claimed); await expect(service.claimNext('mechanic-1')).resolves.toBe(claimed); expect(audit.write).toHaveBeenCalledWith('EXECUTION_CLAIMED', claimed); });
  it('reports an empty queue', async () => { repository.claimNext.mockResolvedValue(null); await expect(service.claimNext('mechanic-1')).rejects.toBeInstanceOf(NotFoundException); });
  it('rejects a non-existent execution', async () => { repository.findById.mockResolvedValue(null); await expect(service.get('missing')).rejects.toBeInstanceOf(NotFoundException); });
  it('returns an existing execution', async () => { const existing = execution(); repository.findById.mockResolvedValue(existing); await expect(service.get('execution-1')).resolves.toBe(existing); });
  it('rejects invalid status transitions', async () => { repository.findById.mockResolvedValue(execution('QUEUED')); await expect(service.updateStatus('execution-1', 'COMPLETED')).rejects.toBeInstanceOf(BadRequestException); });
  it('starts repair after a diagnosis and audits it', async () => { const current = { ...execution('DIAGNOSING'), diagnosis: 'broken belt' }; const repairing = { ...current, status: 'REPAIRING' as const }; repository.findById.mockResolvedValue(current); repository.update.mockResolvedValue(repairing); await expect(service.updateStatus('execution-1', 'REPAIRING')).resolves.toBe(repairing); expect(audit.write).toHaveBeenCalledWith('EXECUTION_REPAIRING', repairing); });
  it('requires a diagnosis before repairing', async () => { repository.findById.mockResolvedValue(execution('DIAGNOSING')); await expect(service.updateStatus('execution-1', 'REPAIRING')).rejects.toBeInstanceOf(BadRequestException); });
  it('persists a completion event in the outbox after repair', async () => { const repairing = { ...execution('REPAIRING'), diagnosis: 'broken belt' }; const done = { ...repairing, status: 'COMPLETED' as const, completedAt: new Date() }; repository.findById.mockResolvedValue(repairing); repository.updateWithOutbox.mockResolvedValue(done); await service.updateStatus('execution-1', 'COMPLETED', { repairNotes: 'belt replaced' }); expect(repository.updateWithOutbox).toHaveBeenCalledWith('execution-1', expect.anything(), expect.objectContaining({ eventType: 'execution.completed' })); expect(audit.write).toHaveBeenCalledWith('EXECUTION_COMPLETION_QUEUED', done); });
  it('generates the completed event payload callback', async () => {
    let capturedPayload: ((execution: Execution) => unknown) | undefined;
    const repairing = { ...execution('REPAIRING'), diagnosis: 'broken belt' };
    repository.findById.mockResolvedValue(repairing);
    repository.updateWithOutbox.mockImplementation(async (_id, _data, event) => {
      capturedPayload = event.payload;
      return { ...execution('COMPLETED'), completedAt: new Date() };
    });
    await service.updateStatus('execution-1', 'COMPLETED', { repairNotes: 'belt replaced' });
    expect(capturedPayload).toBeDefined();
    expect(typeof capturedPayload?.(execution('COMPLETED'))).toEqual('object');
  });
  it('compensates an unfinished execution using the outbox', async () => { const diagnosing = execution('DIAGNOSING'); const cancelled = { ...diagnosing, status: 'CANCELLED' as const }; repository.findByServiceOrderId.mockResolvedValue(diagnosing); repository.updateWithOutbox.mockResolvedValue(cancelled); await expect(service.compensate('order-1', 'approval revoked')).resolves.toBe(cancelled); expect(repository.updateWithOutbox).toHaveBeenCalledWith('execution-1', { status: 'CANCELLED' }, expect.objectContaining({ eventType: 'execution.cancelled' })); });
  it('generates the cancelled event payload callback', async () => {
    let capturedPayload: ((execution: Execution) => unknown) | undefined;
    const diagnosing = execution('DIAGNOSING');
    repository.findByServiceOrderId.mockResolvedValue(diagnosing);
    repository.updateWithOutbox.mockImplementation(async (_id, _data, event) => {
      capturedPayload = event.payload;
      return { ...diagnosing, status: 'CANCELLED' as const };
    });
    await service.compensate('order-1', 'approval revoked');
    expect(capturedPayload).toBeDefined();
    expect(typeof capturedPayload?.(execution('CANCELLED'))).toEqual('object');
  });
  it('does not compensate a completed execution', async () => { repository.findByServiceOrderId.mockResolvedValue(execution('COMPLETED')); await expect(service.compensate('order-1', 'late cancellation')).resolves.toBeNull(); expect(repository.update).not.toHaveBeenCalled(); });
});
