import 'dotenv/config';
import { PremortemService } from '@premortem/core/application';
import { createAiProviderFromEnv } from '@premortem/ai/provider-factory';

const service = new PremortemService(undefined, undefined, createAiProviderFromEnv());
const once = process.argv.includes('--once');
let running = true;

const run = async () => {
  do {
    const rehearsalId = await service.processNextJob();
    if (rehearsalId)
      process.stdout.write(
        `${JSON.stringify({ level: 'info', event: 'job_completed', rehearsalId })}\n`
      );
    if (once) return;
    await new Promise((resolve) => setTimeout(resolve, rehearsalId ? 250 : 1_500));
  } while (running);
};

process.on('SIGINT', () => {
  running = false;
});
process.on('SIGTERM', () => {
  running = false;
});
run().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({ level: 'error', event: 'worker_failed', message: error instanceof Error ? error.message : 'unknown' })}\n`
  );
  process.exitCode = 1;
});
