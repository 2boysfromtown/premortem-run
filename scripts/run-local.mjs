import { spawn } from 'node:child_process';

const isWindows = process.platform === 'win32';
const pnpm = isWindows ? (process.env.ComSpec ?? 'cmd.exe') : 'pnpm';
const pnpmArgs = (args) => (isWindows ? ['/d', '/s', '/c', 'pnpm', ...args] : args);
const noOpen = process.argv.includes('--no-open');
const port = process.env.PORT ?? (noOpen ? '4310' : '4173');
const host = process.env.HOST ?? (noOpen ? '0.0.0.0' : '127.0.0.1');
const publicHost = host === '0.0.0.0' ? '127.0.0.1' : host;
const appUrl = `http://${publicHost}:${port}`;
const environment = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  ALLOW_DEMO_TARGET: process.env.ALLOW_DEMO_TARGET ?? 'true',
  DEMO_ORIGIN: process.env.DEMO_ORIGIN ?? 'http://127.0.0.1:4312',
  DEMO_TARGET_HOST: process.env.DEMO_TARGET_HOST ?? '127.0.0.1',
  HOST: host,
  PORT: port,
  SERVE_WEB: 'true'
};

const children = [
  ['demo', ['start:demo']],
  ['api', ['start:api']],
  ['worker', ['start:worker']]
].map(([name, args]) => ({
  name,
  process: spawn(pnpm, pnpmArgs(args), {
    cwd: process.cwd(),
    env: environment,
    stdio: 'inherit'
  })
}));

let stopping = false;
const stop = (exitCode = 0) => {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.process.kill('SIGTERM');
  process.exitCode = exitCode;
};

for (const child of children) {
  child.process.on('exit', (code, signal) => {
    if (stopping) return;
    process.stderr.write(
      `${JSON.stringify({ event: 'local_process_stopped', process: child.name, code, signal })}\n`
    );
    stop(code ?? 1);
  });
  child.process.on('error', (error) => {
    process.stderr.write(
      `${JSON.stringify({ event: 'local_process_failed', process: child.name, message: error.message })}\n`
    );
    stop(1);
  });
}

process.once('SIGINT', () => stop(0));
process.once('SIGTERM', () => stop(0));

const waitForApp = async () => {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline && !stopping) {
    try {
      const response = await fetch(`${appUrl}/health`, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
    } catch {
      // The API is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`PREMORTEM did not become healthy at ${appUrl}`);
};

const openBrowser = () => {
  if (isWindows) {
    spawn('cmd.exe', ['/c', 'start', '', appUrl], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  const command = process.platform === 'darwin' ? 'open' : 'xdg-open';
  spawn(command, [appUrl], { detached: true, stdio: 'ignore' }).unref();
};

waitForApp()
  .then(() => {
    process.stdout.write(`\nPREMORTEM is ready at ${appUrl}\n`);
    if (!noOpen) openBrowser();
  })
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Local startup failed'}\n`);
    stop(1);
  });
