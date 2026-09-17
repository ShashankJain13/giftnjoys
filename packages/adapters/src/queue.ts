import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import type { Logger } from './logger';

export interface JobQueue<T> {
  enqueue(message: T): Promise<void>;
}

/**
 * Local development: runs the handler on the next tick in the same process.
 * Failures are logged, never thrown back to the caller (same as a real queue).
 */
export class InProcessQueue<T> implements JobQueue<T> {
  private readonly pending = new Set<Promise<void>>();

  constructor(
    private readonly name: string,
    private readonly handler: (message: T) => Promise<void>,
    private readonly log: Logger,
  ) {}

  async enqueue(message: T): Promise<void> {
    const run = new Promise<void>((resolve) => setImmediate(resolve))
      .then(() => this.handler(message))
      .catch((err: unknown) => this.log.error(`queue.${this.name}.failed`, { error: String(err) }))
      .finally(() => this.pending.delete(run));
    this.pending.add(run);
  }

  /** Test helper: wait for all in-flight jobs. */
  async drain(): Promise<void> {
    while (this.pending.size) await Promise.all([...this.pending]);
  }
}

export class SqsQueue<T> implements JobQueue<T> {
  private readonly client: SQSClient;

  constructor(private readonly config: { queueUrl: string; region: string }) {
    this.client = new SQSClient({ region: config.region });
  }

  async enqueue(message: T): Promise<void> {
    await this.client.send(
      new SendMessageCommand({ QueueUrl: this.config.queueUrl, MessageBody: JSON.stringify(message) }),
    );
  }
}
