import { z } from 'zod'

// ─── Field Definition ─────────────────────────────────────────────────────

export const FieldTypeSchema = z.enum([
  'text',
  'email',
  'number',
  'boolean',
  'textarea',
])

export const FieldDefinitionSchema = z.object({
  name: z.string().min(1).max(50).regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, {
    message: 'Field name must be alphanumeric with underscores, starting with a letter',
  }),
  type: FieldTypeSchema,
  required: z.boolean(),
  label: z.string().min(1).max(100),
})

// ─── Create Project ───────────────────────────────────────────────────────

export const CreateProjectSchema = z.object({
  name: z.string().min(1).max(80),
  schema: z
    .array(FieldDefinitionSchema)
    .min(1, 'At least one field is required')
    .max(20, 'Maximum 20 fields allowed'),
  allowed_origins: z.array(z.string().url()).max(10).default([]),
  email_notifications: z.boolean().default(true),
})

// ─── Update Project ───────────────────────────────────────────────────────

export const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  schema: z
    .array(FieldDefinitionSchema)
    .min(1)
    .max(20)
    .optional(),
  allowed_origins: z.array(z.string().url()).max(10).optional(),
  email_notifications: z.boolean().optional(),
})

// ─── Types ────────────────────────────────────────────────────────────────

export type FieldType = z.infer<typeof FieldTypeSchema>
export type FieldDefinition = z.infer<typeof FieldDefinitionSchema>
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>
