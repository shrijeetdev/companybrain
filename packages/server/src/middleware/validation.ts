import { z, type ZodSchema } from 'zod';
import type { FastifyRequest, FastifyReply } from 'fastify';

export class ValidationError extends Error {
  statusCode = 400;
  details: Record<string, string>;
  constructor(details: Record<string, string>) {
    super('Validation failed');
    this.details = details;
  }
}

export function validateBody<T>(schema: ZodSchema<T>) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const path = issue.path.join('.');
        details[path || '_root'] = issue.message;
      }
      return reply.code(400).send({ error: 'Validation failed', details });
    }
    (req as any).validatedBody = result.data;
  };
}

export function validateQuery<T>(schema: ZodSchema<T>) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const details: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const path = issue.path.join('.');
        details[path || '_root'] = issue.message;
      }
      return reply.code(400).send({ error: 'Validation failed', details });
    }
    (req as any).validatedQuery = result.data;
  };
}

// --- Schemas for all API routes ---

export const CreateLoopSchema = z.object({
  title: z.string().trim().min(1, 'title is required').max(500),
  why: z.string().trim().max(1000).optional().default(''),
  side: z.enum(['yours', 'theirs']).optional().default('yours'),
  channel: z.enum(['email', 'slack', 'whatsapp', 'telegram', 'calendar', 'github', 'manual']).optional().default('manual'),
});

export const SnoozeLoopSchema = z.object({
  hours: z.number().int().min(1).max(720).optional().default(24),
});

export const AssignSchema = z.object({
  userIds: z.array(z.string().trim().min(1)).min(1).max(20),
});

export const CreateTaskSchema = z.object({
  title: z.string().trim().min(1, 'title is required').max(500),
  emoji: z.string().max(8).optional().default(''),
  day: z.enum(['today', 'tomorrow', 'upcoming']).optional().default('today'),
  priority: z.enum(['low', 'med', 'high']).nullable().optional().default(null),
  list: z.string().trim().max(200).optional().default('Inbox'),
  recurring: z.boolean().optional().default(false),
  recur: z.enum(['Daily', 'Weekly', 'Monthly']).nullable().optional().default(null),
});

export const MoveTaskSchema = z.object({
  day: z.enum(['today', 'tomorrow', 'upcoming']).optional().default('today'),
});

export const CreateLeadSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(200),
  company: z.string().trim().max(200).optional().default(''),
  title: z.string().trim().max(200).optional().default(''),
  phone: z.string().trim().max(50).optional().default(''),
  email: z.string().trim().email().max(200).optional().default(''),
  what: z.string().trim().max(500).optional().default(''),
  value: z.number().min(0).max(1e12).optional().nullable().default(null),
  source: z.enum(['email', 'slack', 'whatsapp', 'telegram', 'calendar', 'github', 'manual']).optional().default('manual'),
});

export const SetLeadStageSchema = z.object({
  stage: z.enum(['new', 'contacted', 'meeting', 'proposal', 'won', 'lost']),
});

export const QuickAddLeadSchema = z.object({
  phone: z.string().trim().max(50).optional().default(''),
  note: z.string().trim().min(1, 'note is required').max(2000),
});

export const ExtractCardSchema = z.object({
  imageBase64: z.string().max(10_000_000).optional(),
  text: z.string().trim().max(5000).optional(),
}).refine((d) => d.imageBase64 || d.text, { message: 'imageBase64 or text is required' });

export const SetAiActionSchema = z.object({
  action: z.enum(['generate', 'publish_blog']).nullable(),
  config: z.object({
    promptOverride: z.string().trim().max(4000).optional(),
    modelOverride: z.string().trim().max(200).optional(),
  }).optional(),
});

export const WordpressCredsSchema = z.object({
  apiUrl: z.string().trim().url('apiUrl must be a URL').max(500),
  username: z.string().trim().min(1, 'username is required').max(200),
  appPassword: z.string().min(1, 'appPassword is required').max(500),
});

export const AutonomySchema = z.object({
  action: z.enum(['createTasks', 'sendReminders', 'draftReplies', 'chase', 'joinMeetings']),
  level: z.enum(['off', 'ask', 'auto']),
});

export const LoginSchema = z.object({
  userId: z.string().trim().min(1),
  key: z.string().trim().min(1),
});

export const CreateUserSchema = z.object({
  email: z.string().trim().email().max(200),
  username: z.string().trim().min(3).max(50).optional(),
  name: z.string().trim().min(1).max(200),
  role: z.enum(['ceo', 'manager', 'employee', 'client', 'agent']),
  password: z.string().min(8, 'password must be at least 8 characters').max(200),
});

export const UpdateUserSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  email: z.string().trim().email().max(200).optional(),
  username: z.string().trim().min(3).max(50).nullable().optional(),
  role: z.enum(['ceo', 'manager', 'employee', 'client', 'agent']).optional(),
  active: z.boolean().optional(),
});

export const SetPasswordSchema = z.object({
  password: z.string().min(8, 'password must be at least 8 characters').max(200),
});

export const WebhookFanInSchema = z.object({
  from: z.string().trim().max(200).optional().default('unknown'),
  text: z.string().trim().min(1, 'text is required').max(10000),
  ref: z.string().trim().max(500).optional(),
});
