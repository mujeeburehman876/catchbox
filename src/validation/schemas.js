import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const fieldSchema = z.object({
  name: z.string().min(1).max(64),
  label: z.string().min(1).max(120),
  type: z.enum(['text', 'email', 'tel', 'textarea', 'checkbox']),
  required: z.boolean().default(false),
});

export const createWidgetSchema = z.object({
  type: z.enum(['signup_form', 'cta_popover', 'contact_form']),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  fields: z.array(fieldSchema).min(1).max(20),
  buttonText: z.string().min(1).max(60).default('Submit'),
  displayOptions: z.record(z.any()).default({}),
});

export const updateWidgetSchema = createWidgetSchema.partial().extend({
  bumpBundleVersion: z.boolean().optional(),
});

// Public submission payload. We validate structurally here; per-widget
// required-field checks happen in the service layer once the widget's
// own field definitions are loaded.
export const submissionSchema = z
  .object({
    // 'website' is our honeypot -- a real visitor never sees or fills this
    // field because it's hidden by the widget CSS. Bots that fill every
    // input on a form will fill it.
    website: z.string().max(500).optional().default(''),
    data: z.record(z.union([z.string(), z.boolean(), z.number()])).refine(
      (obj) => Object.keys(obj).length <= 30,
      { message: 'Too many fields in submission' }
    ),
    idempotencyKey: z.string().max(128).optional(),
  })
  .strict();

// Hard cap on raw request body size for the public endpoint, enforced by
// express.json({ limit }) in app.js, in addition to this shape check.
