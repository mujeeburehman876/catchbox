import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: 'not_found', message: `No route for ${req.method} ${req.path}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'validation_error',
      message: 'Request payload failed validation',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'payload_too_large', message: 'Request body exceeds size limit' });
  }

  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'invalid_json', message: 'Request body is not valid JSON' });
  }

  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.code, message: err.message });
  }

  // Anything unexpected: log server-side, never leak internals to the client.
  console.error('[unhandled_error]', err);
  return res.status(500).json({ error: 'internal_error', message: 'Something went wrong' });
}
