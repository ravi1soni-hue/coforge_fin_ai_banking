import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);

export const ChatPayloadSchema = z.object({
  message: nonEmptyString,
  knownFacts: z.record(z.string(), z.unknown()).optional(),
});

export const ClientSocketMessageSchema = z.object({
  v: z.literal(1),
  type: z.literal("CHAT_QUERY"),
  requestId: nonEmptyString.optional(),
  sessionId: nonEmptyString.optional(),
  payload: ChatPayloadSchema,
  meta: z
    .object({
      platform: nonEmptyString.optional(),
      appVersion: nonEmptyString.optional(),
      locale: nonEmptyString.optional(),
      timezone: nonEmptyString.optional(),
    })
    .optional(),
});

export type ClientSocketMessage = z.infer<
  typeof ClientSocketMessageSchema
>;

export const ServerSocketSuccessSchema = z.object({
  v: z.literal(1),
  type: z.literal("CHAT_RESPONSE"),
  requestId: nonEmptyString,
  sessionId: nonEmptyString.optional(),
  status: z.literal("success"),
  timestamp: nonEmptyString,
  data: z.object({
    type: z.enum(["FOLLOW_UP", "FINAL", "ERROR"]),
    message: z.string(),
    missingFacts: z.array(z.string()).optional(),
  }),
});

export const ServerSocketErrorSchema = z.object({
  v: z.literal(1),
  type: z.literal("CHAT_RESPONSE"),
  requestId: nonEmptyString,
  sessionId: nonEmptyString.optional(),
  status: z.literal("error"),
  timestamp: nonEmptyString,
  error: z.object({
    code: nonEmptyString,
    message: z.string(),
    retriable: z.boolean().default(false),
  }),
});

export type ServerSocketSuccessMessage = z.infer<
  typeof ServerSocketSuccessSchema
>;

export type ServerSocketErrorMessage = z.infer<
  typeof ServerSocketErrorSchema
>;

export type ServerSocketMessage =
  | ServerSocketSuccessMessage
  | ServerSocketErrorMessage;