import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';

test('runs the real demo rehearsal and opens a customer replay', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'See how your launch dies before real customers arrive.' })
  ).toBeVisible();
  await page
    .getByRole('button', { name: /Run a launch rehearsal/ })
    .first()
    .click();
  await page.locator('input[name="authorized"]').check();
  const createdResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/rehearsals') && response.request().method() === 'POST'
  );
  await page.getByRole('button', { name: /Create rehearsal/ }).click();
  const created = (await (await createdResponse).json()) as { rehearsalId: string };
  await expect(
    page.getByRole('heading', { name: 'Your simulated customers are inside.' })
  ).toBeVisible();

  const workerCommand =
    process.platform === 'win32'
      ? { command: 'cmd.exe', args: ['/d', '/s', '/c', 'pnpm start:worker --once'] }
      : { command: 'pnpm', args: ['start:worker', '--once'] };
  for (let attempt = 0; attempt < 5; attempt += 1) {
    execFileSync(workerCommand.command, workerCommand.args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'development',
        ALLOW_DEMO_TARGET: 'true',
        DEMO_ORIGIN: 'http://127.0.0.1:4312'
      },
      timeout: 90_000,
      stdio: 'pipe'
    });
    const status = await page.request.get(`/api/rehearsals/${created.rehearsalId}/status`);
    const body = (await status.json()) as { status: string };
    if (['completed', 'partially-completed', 'inconclusive'].includes(body.status)) break;
  }

  await expect(page.locator('.report-title h1')).toContainText('Your launch died', {
    timeout: 30_000
  });
  await expect(page.locator('.session-table button')).toHaveCount(5);
  await expect(page.locator('.finding-row')).toHaveCount(7);
  await page.locator('.session-table button').first().click();
  await expect(page.locator('#replay')).toBeVisible();
  await expect(page.locator('#replay .timeline-step').first()).toBeVisible();
});
