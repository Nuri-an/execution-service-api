import type { Prisma } from "@prisma/client";

export type ExecutionStatus =
  | "QUEUED"
  | "DIAGNOSING"
  | "REPAIRING"
  | "COMPLETED"
  | "CANCELLED";

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
  create(data: {
    serviceOrderId: string;
    priority: number;
  }): Promise<Execution>;
  createWithOutbox(
    data: { serviceOrderId: string; priority: number },
    event: OutboxDefinition,
  ): Promise<Execution>;
  findById(id: string): Promise<Execution | null>;
  findByServiceOrderId(serviceOrderId: string): Promise<Execution | null>;
  claimNext(assignedTo: string): Promise<Execution | null>;
  update(
    id: string,
    data: Partial<
      Pick<
        Execution,
        | "status"
        | "diagnosis"
        | "repairNotes"
        | "assignedTo"
        | "startedAt"
        | "completedAt"
      >
    >,
  ): Promise<Execution>;
  updateWithOutbox(
    id: string,
    data: Partial<
      Pick<
        Execution,
        | "status"
        | "diagnosis"
        | "repairNotes"
        | "assignedTo"
        | "startedAt"
        | "completedAt"
      >
    >,
    event: OutboxDefinition,
  ): Promise<Execution>;
  claimPendingOutbox(limit: number): Promise<OutboxEvent[]>;
  markOutboxPublished(id: string): Promise<void>;
  releaseOutbox(id: string): Promise<void>;
}

export interface AuditLog {
  write(
    event: string,
    execution: Execution,
    metadata?: Record<string, unknown>,
  ): Promise<void>;
}
export interface SagaEventPublisher {
  publish(event: SagaEventName, payload: Prisma.JsonValue): Promise<void>;
  publishStored(event: OutboxEvent): Promise<void>;
}
export type SagaEventName =
  | "service-order.approved"
  | "service-order.cancelled"
  | "execution.queued"
  | "execution.completed"
  | "execution.cancelled";
export interface OutboxDefinition {
  eventType: SagaEventName;
  payload: (execution: Execution) => Prisma.InputJsonValue;
}
export interface OutboxEvent {
  id: string;
  eventType: SagaEventName;
  payload: Prisma.JsonValue;
  attempts: number;
  createdAt: Date;
}

export const EXECUTION_REPOSITORY = Symbol("EXECUTION_REPOSITORY");
export const AUDIT_LOG = Symbol("AUDIT_LOG");
export const SAGA_EVENT_PUBLISHER = Symbol("SAGA_EVENT_PUBLISHER");
