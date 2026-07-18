import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { MongoClient } from 'mongodb';
import { AuditLog, Execution } from './execution.types';

@Injectable()
export class MongoAuditLogService implements AuditLog, OnModuleDestroy {
  private readonly logger = new Logger(MongoAuditLogService.name);
  private client?: MongoClient;
  private async collection() {
    if (!this.client) { this.client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017/execution_logs'); await this.client.connect(); }
    return this.client.db().collection('execution_audit_logs');
  }
  async write(event: string, execution: Execution, metadata: Record<string, unknown> = {}) {
    try { await (await this.collection()).insertOne({ event, executionId: execution.id, serviceOrderId: execution.serviceOrderId, status: execution.status, metadata, occurredAt: new Date() }); }
    catch (error) { this.logger.error(`Could not persist audit event ${event}`, error); }
  }
  async onModuleDestroy() { await this.client?.close(); }
}
