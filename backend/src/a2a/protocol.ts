import type { AgentQueueEnvelope } from "./types";
import { AgentQueueMessageFactory, normalizeTags } from "./queue";

export { AgentQueueMessageFactory as QueueEnvelopeFactory, normalizeTags };

export function validateEnvelope(message: AgentQueueEnvelope): string[] {
  const errors: string[] = [];
  if (!message.id) errors.push("id is required");
  if (!message.queue) errors.push("queue is required");
  if (!message.sender) errors.push("sender is required");
  if (!message.recipient) errors.push("recipient is required");
  if (!message.type) errors.push("type is required");
  if (!message.createdAt) errors.push("createdAt is required");
  if (!message.availableAt) errors.push("availableAt is required");
  if (!message.metadata || typeof message.metadata !== "object") errors.push("metadata is required");
  if (!Array.isArray(message.tags)) errors.push("tags must be an array");
  if (message.maxAttempts < 1) errors.push("maxAttempts must be at least 1");
  if (!message.checksum) errors.push("checksum is required");
  return errors;
}

export function validatePayloadEnvelope<TPayload>(message: AgentQueueEnvelope<TPayload>): string[] {
  const errors = validateEnvelope(message);
  if (message.deliveryState === "dead-lettered" && !message.metadata.errorMessage) {
    errors.push("dead-lettered messages should record an errorMessage");
  }
  return errors;
}
