# Execution Service

This microservice is responsible for the operational queue of service orders (SOs), diagnostics, and repairs. It owns its own data: PostgreSQL stores the transactional state of the queue, while MongoDB maintains the operational audit trail.

## Communication and Saga

A **choreographed Saga** was adopted using RabbitMQ with the `workshop.saga` exchange (`topic` type). This approach eliminates the need for a central orchestrator and keeps the Service Order, Billing, and Execution services loosely coupled: each service reacts only to domain events and updates exclusively its own database. REST APIs remain appropriate for synchronous queries, such as retrieving an execution, but they are **not** used to coordinate Saga transactions.

```text
Service order created → quotation generated → approval
                                           │
                    service-order.approved (RabbitMQ)
                                           ▼
                         Execution queues the service order
                                           │
                  execution.queued / execution.completed
                                           ▼
                  Service Order Service updates the SO via event
```

The Execution Service consumes the `service-order.approved` event and publishes `execution.queued`. Once the work is completed, it publishes `execution.completed`; the Service Order Service must consume this event and update its own service order. There is no HTTP callback for completion and no direct access to another service's database.

### Compensation

If a quotation approval is revoked after the service order has already entered the queue, the Service Order Service publishes `service-order.cancelled`. The Execution Service consumes this event, cancels the execution locally if it has not yet been completed, and publishes `execution.cancelled`. The operation is idempotent: duplicate messages do not create multiple executions thanks to the unique `serviceOrderId` constraint, and completed executions are never compensated.

## API Contract

- `POST /api/v1/executions/claim-next`: Atomically and by priority assigns the next service order to a mechanic.
- `PATCH /api/v1/executions/:id/status`: Advances the execution through `QUEUED → DIAGNOSING → REPAIRING → COMPLETED` (or cancels it).
- `GET /api/v1/executions/:id`: Retrieves the current execution status.

Entries into the queue occur **exclusively** through the RabbitMQ `service-order.approved` event, not through a REST endpoint.

## Local Development

```bash
cp .env.example .env
npm install
npx prisma migrate dev --name init
docker compose up --build
```

##### Local Services

> API: http://localhost:3002/api/v1/health  
> Swagger: http://localhost:3002/api/docs  
> RabbitMQ Management: http://localhost:15672  
> Username: guest — Password: guest  
> PostgreSQL: localhost:5433  
> MongoDB: localhost:27017

The `DATABASE_URL`, `MONGODB_URI`, and `RABBITMQ_URL` credentials must be provided through Kubernetes Secrets. The ConfigMap contains only non-sensitive configuration values. The pipeline defined in `.github/workflows/execution-service.yml` performs the build, linting, tests with a minimum global coverage threshold of **80%**, SonarQube quality gate validation, image publishing to Amazon ECR, and deployment rollout to Amazon EKS.
