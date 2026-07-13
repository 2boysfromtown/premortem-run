import 'dotenv/config';
import { resolve } from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { PremortemService } from '@premortem/core/application';
import { createAiProviderFromEnv } from '@premortem/ai/provider-factory';

const app = express();
const service = new PremortemService(undefined, undefined, createAiProviderFromEnv());
const port = Number(process.env.PORT ?? 4310);
const host = process.env.HOST ?? '127.0.0.1';
const serveWeb = process.env.SERVE_WEB === 'true' || process.env.NODE_ENV === 'production';
const webRoot = resolve('dist/web');
const creationAttempts = new Map<string, number[]>();

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use((_request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; frame-ancestors 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'"
  );
  next();
});

app.get('/health', (_request, response) => response.json({ status: 'ok', component: 'api' }));
app.get('/worker-health', (_request, response) =>
  response.json({ status: 'ok', mechanism: 'database-lease', checkedAt: new Date().toISOString() })
);

app.post('/api/rehearsals', async (request, response, next) => {
  try {
    const key = request.ip ?? 'local';
    const recent = (creationAttempts.get(key) ?? []).filter((time) => Date.now() - time < 60_000);
    if (recent.length >= 8)
      return response
        .status(429)
        .json({ error: 'RATE_LIMITED', message: 'Wait before creating another rehearsal.' });
    creationAttempts.set(key, [...recent, Date.now()]);
    const created = await service.createRehearsal(request.body);
    response.status(202).json(created);
  } catch (error) {
    next(error);
  }
});

app.get('/api/rehearsals/:id/status', (request, response, next) => {
  try {
    response.json(service.getRehearsalStatus(String(request.params.id)));
  } catch (error) {
    next(error);
  }
});
app.get('/api/rehearsals/:id/report', (request, response, next) => {
  try {
    response.json(service.getLaunchReport(String(request.params.id)));
  } catch (error) {
    next(error);
  }
});
app.get('/api/rehearsals/:id/sessions/:sessionId', (request, response, next) => {
  try {
    response.json(
      service.getSessionReplay(String(request.params.id), String(request.params.sessionId))
    );
  } catch (error) {
    next(error);
  }
});
app.post('/api/rehearsals/:id/rerun', (request, response, next) => {
  try {
    response.status(202).json(service.rerunRehearsal(String(request.params.id)));
  } catch (error) {
    next(error);
  }
});
app.post('/api/rehearsals/:id/cancel', (request, response, next) => {
  try {
    response.json(service.cancelRehearsal(String(request.params.id)));
  } catch (error) {
    next(error);
  }
});
app.post('/api/rehearsals/:id/retry', (request, response, next) => {
  try {
    response.status(202).json(service.retryFailedRehearsal(String(request.params.id)));
  } catch (error) {
    next(error);
  }
});
app.post('/api/rehearsals/:id/share', (request, response, next) => {
  try {
    response.json(service.createPublicReport(String(request.params.id)));
  } catch (error) {
    next(error);
  }
});
app.get('/api/public/reports/:token', (request, response, next) => {
  try {
    response.json(service.getPublicReport(String(request.params.token)));
  } catch (error) {
    next(error);
  }
});
app.get('/api/comparisons', (request, response, next) => {
  try {
    const baseline = typeof request.query.baseline === 'string' ? request.query.baseline : '';
    const candidate = typeof request.query.candidate === 'string' ? request.query.candidate : '';
    response.json(service.compareRehearsals(baseline, candidate));
  } catch (error) {
    next(error);
  }
});

app.use(
  '/artifacts',
  express.static(resolve(process.env.ARTIFACTS_DIR ?? '.premortem/artifacts'), {
    dotfiles: 'deny',
    fallthrough: false,
    index: false,
    maxAge: '1h'
  })
);
if (serveWeb) {
  app.use(express.static(webRoot, { dotfiles: 'deny', index: 'index.html' }));
  app.use((request, response, next) => {
    if (request.method !== 'GET' || !request.accepts('html')) {
      next();
      return;
    }
    response.sendFile(resolve(webRoot, 'index.html'));
  });
}
app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  const details = error as {
    statusCode?: number;
    code?: string;
    message?: string;
    issues?: unknown;
  };
  const status = details.statusCode ?? (details.issues ? 400 : 500);
  response.status(status).json({
    error: details.code ?? (details.issues ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR'),
    message: status >= 500 ? 'Request failed' : (details.message ?? 'Request failed'),
    details: details.issues ?? undefined
  });
});

app.listen(port, host, () =>
  process.stdout.write(`${JSON.stringify({ level: 'info', event: 'api_started', host, port })}\n`)
);
