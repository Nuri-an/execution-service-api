import { ConflictException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Channel, ChannelModel, ConsumeMessage, connect } from 'amqplib';
import { ExecutionService } from './execution.service';
import { SagaEventName, SagaEventPublisher } from './execution.types';

type ApprovedEvent = { serviceOrderId: string; priority?: number };
type CancelledEvent = { serviceOrderId: string; reason?: string };

@Injectable()
export class RabbitMqEventBus implements OnModuleInit, OnModuleDestroy, SagaEventPublisher {
  private readonly logger = new Logger(RabbitMqEventBus.name);
  private connection?: ChannelModel;
  private channel?: Channel;
  private connectionPromise?: Promise<void>;
  readonly exchange = process.env.RABBITMQ_EXCHANGE || 'workshop.saga';
  private readonly retryDelayMs = Number(process.env.RABBITMQ_RETRY_DELAY_MS ?? 3000);
  private readonly maxRetries = Math.max(Number(process.env.RABBITMQ_MAX_RETRIES ?? 10), 1);

  async onModuleInit() {
    await this.ensureConnected();
  }

  private async ensureConnected() {
    if (this.channel) return;
    if (!this.connectionPromise) this.connectionPromise = this.connectWithRetry();
    await this.connectionPromise;
  }

  private async connectWithRetry() {
    const connectionUrl = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const connection = await connect(connectionUrl);
        const channel = await connection.createChannel();
        await channel.assertExchange(this.exchange, 'topic', { durable: true });
        this.connection = connection;
        this.channel = channel;
        this.logger.log(`RabbitMQ connected to ${connectionUrl}`);
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        if (attempt === this.maxRetries) {
          this.logger.error(`RabbitMQ connection failed after ${attempt} attempts: ${message}`);
          throw error;
        }

        this.logger.warn(`RabbitMQ is not ready yet (${message}). Retrying in ${this.retryDelayMs}ms...`);
        await this.delay(this.retryDelayMs);
      }
    }
  }

  async publish(event: SagaEventName, payload: Record<string, unknown>) {
    await this.ensureConnected();
    if (!this.channel) throw new Error('RabbitMQ channel is not connected');

    this.channel.publish(this.exchange, event, Buffer.from(JSON.stringify({ eventId: randomUUID(), event, occurredAt: new Date().toISOString(), payload })), { persistent: true, contentType: 'application/json' });
  }

  async consume(queue: string, keys: string[], handler: (message: ConsumeMessage) => Promise<void>) {
    await this.ensureConnected();
    if (!this.channel) throw new Error('RabbitMQ channel is not connected');

    await this.channel.assertQueue(queue, { durable: true });
    await Promise.all(keys.map((key) => this.channel!.bindQueue(queue, this.exchange, key)));
    await this.channel.consume(queue, async (message) => {
      if (!message || !this.channel) return;
      try { await handler(message); this.channel.ack(message); }
      catch (error) { this.logger.error(`Saga event failed and will be retried: ${error instanceof Error ? error.message : 'unknown error'}`); this.channel.nack(message, false, true); }
    }, { noAck: false });
  }

  async onModuleDestroy() { await this.channel?.close(); await this.connection?.close(); }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

@Injectable()
export class RabbitMqSagaConsumer implements OnModuleInit {
  private readonly logger = new Logger(RabbitMqSagaConsumer.name);
  constructor(private readonly executionService: ExecutionService, private readonly bus: RabbitMqEventBus) {}
  async onModuleInit() {
    await this.bus.consume('execution-service.saga', ['service-order.approved', 'service-order.cancelled'], (message) => this.handle(message));
    this.logger.log(`Consuming Saga events from ${this.bus.exchange}`);
  }
  private async handle(message: ConsumeMessage) {
    const event = JSON.parse(message.content.toString()) as { event: SagaEventName; payload: ApprovedEvent & CancelledEvent };
    if (event.event === 'service-order.approved') await this.enqueueApproved(event.payload);
    if (event.event === 'service-order.cancelled') await this.executionService.compensate(event.payload.serviceOrderId, event.payload.reason || 'OS cancelled');
  }
  private async enqueueApproved(event: ApprovedEvent) {
    if (!event.serviceOrderId) throw new Error('serviceOrderId is required');
    try { await this.executionService.enqueue(event.serviceOrderId, event.priority || 0); }
    catch (error) { if (!(error instanceof ConflictException)) throw error; }
  }
}
