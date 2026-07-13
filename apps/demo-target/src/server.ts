import { createDemoApp } from './app.js';

const fallbackPort = 4312;
const parsedPort = Number.parseInt(process.env.DEMO_TARGET_PORT ?? '', 10);
const port =
  Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort < 65_536 ? parsedPort : fallbackPort;
const host = process.env.DEMO_TARGET_HOST ?? '127.0.0.1';

const server = createDemoApp().listen(port, host, () => {
  console.log(
    JSON.stringify({
      event: 'demo_target_started',
      url: `http://${host}:${port}`
    })
  );
});

function shutDown(signal: string): void {
  server.close((error) => {
    if (error) {
      console.error(
        JSON.stringify({ event: 'demo_target_shutdown_failed', signal, error: error.message })
      );
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify({ event: 'demo_target_stopped', signal }));
  });
}

process.once('SIGINT', () => shutDown('SIGINT'));
process.once('SIGTERM', () => shutDown('SIGTERM'));
