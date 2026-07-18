import { connect } from 'amqplib';
import { RabbitMqEventBus } from './rabbitmq-saga.service';

jest.mock('amqplib', () => ({
  connect: jest.fn(),
}));

describe('RabbitMqEventBus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RABBITMQ_RETRY_DELAY_MS = '0';
  });

  it('retries connecting until RabbitMQ is available', async () => {
    const connectMock = connect as unknown as jest.Mock;
    const channel = {
      assertExchange: jest.fn().mockResolvedValue(undefined),
      publish: jest.fn(),
      assertQueue: jest.fn().mockResolvedValue(undefined),
      bindQueue: jest.fn().mockResolvedValue(undefined),
      consume: jest.fn().mockResolvedValue(undefined),
      ack: jest.fn(),
      nack: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const connection = {
      createConfirmChannel: jest.fn().mockResolvedValue(channel),
      close: jest.fn().mockResolvedValue(undefined),
    };

    connectMock.mockRejectedValueOnce(new Error('temporary failure'));
    connectMock.mockResolvedValueOnce(connection);

    const bus = new RabbitMqEventBus();

    await expect(bus.onModuleInit()).resolves.toBeUndefined();
    expect(connectMock).toHaveBeenCalledTimes(2);
  });
});
