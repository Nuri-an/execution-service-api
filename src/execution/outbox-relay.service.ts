import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaExecutionRepository } from './prisma-execution.repository';
import { RabbitMqEventBus } from './rabbitmq-saga.service';

@Injectable()
export class OutboxRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayService.name);
  private readonly intervalMs = Number(process.env.OUTBOX_RELAY_INTERVAL_MS || 1000);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly repository: PrismaExecutionRepository, private readonly eventBus: RabbitMqEventBus) {}

  async onModuleInit() {
    await this.flush();
    this.timer = setInterval(() => void this.flush(), this.intervalMs);
  }

  async onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  private async flush() {
    if (this.running) return;
    this.running = true;
    try {
      const events = await this.repository.claimPendingOutbox(50);
      for (const event of events) {
        try {
          await this.eventBus.publishStored(event);
          await this.repository.markOutboxPublished(event.id);
        } catch (error) {
          this.logger.error(`Outbox event ${event.id} could not be published`, error);
          await this.repository.releaseOutbox(event.id);
        }
      }
    } finally { this.running = false; }
  }
}
