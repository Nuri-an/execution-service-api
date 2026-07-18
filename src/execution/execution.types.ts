export type ExecutionStatus = 'QUEUED' | 'DIAGNOSING' | 'REPAIRING' | 'COMPLETED' | 'CANCELLED';

export interface Execution {
  id: string;
  serviceOrderId: string;
  priority: number;
  status: ExecutionStatus;
  diagnosis?: string | null;
  repairNotes?: string | null;
  assignedTo?: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExecutionRepository {
  create(data: { serviceOrderId: string; priority: number }): Promise<Execution>;
  findById(id: string): Promise<Execution | null>;
  findByServiceOrderId(serviceOrderId: string): Promise<Execution | null>;
  claimNext(assignedTo: string): Promise<Execution | null>;
  update(id: string, data: Partial<Pick<Execution, 'status' | 'diagnosis' | 'repairNotes' | 'assignedTo' | 'startedAt' | 'completedAt'>>): Promise<Execution>;
}

export interface AuditLog { write(event: string, execution: Execution, metadata?: Record<string, unknown>): Promise<void>; }
export interface SagaEventPublisher { publish(event: SagaEventName, payload: Record<string, unknown>): Promise<void>; }
export type SagaEventName = 'service-order.approved' | 'service-order.cancelled' | 'execution.queued' | 'execution.completed' | 'execution.cancelled';

export const EXECUTION_REPOSITORY = Symbol('EXECUTION_REPOSITORY');
export const AUDIT_LOG = Symbol('AUDIT_LOG');
export const SAGA_EVENT_PUBLISHER = Symbol('SAGA_EVENT_PUBLISHER');
