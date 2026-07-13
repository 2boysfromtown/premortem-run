import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDemoApp } from '../../../apps/demo-target/src/app';
import type { AiProvider, BrowserAgentInput } from '@premortem/core/ai-provider';
import { deterministicPersonas } from '@premortem/core/contracts';
import { runGenericBrowserScenario } from './generic-runner';

describe('generic AI browser runner', () => {
  let server: Server;
  let origin: string;
  let artifactsDir: string;

  beforeAll(async () => {
    server = createDemoApp().listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    artifactsDir = await mkdtemp(join(tmpdir(), 'premortem-generic-'));
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
    await rm(artifactsDir, { recursive: true, force: true });
  });

  it('completes a real deterministic URL goal through validated provider actions', async () => {
    let call = 0;
    const provider: AiProvider = {
      kind: 'openai',
      generatePersonas: vi.fn(),
      nextAction: vi.fn(async (input: BrowserAgentInput) => {
        call += 1;
        if (call === 1) return { type: 'scroll', direction: 'down' };
        if (call === 2) {
          const field = input.affordances.find((item) => item.role === 'input');
          return { type: 'type', elementId: field?.id, text: 'do-not-use-model-text' };
        }
        const button = input.affordances.find((item) =>
          item.text.toLowerCase().includes('make it happen')
        );
        return { type: 'click', elementId: button?.id };
      })
    };

    const result = await runGenericBrowserScenario({
      sessionId: 'session-generic-success',
      startingUrl: origin,
      allowedOrigin: origin,
      persona: deterministicPersonas(2)[1]!,
      maxSteps: 8,
      maxDurationMs: 30_000,
      artifactsDir,
      productName: 'Launchly',
      productDescription: 'A workspace for small teams preparing to launch.',
      targetCustomer: 'Small-business owners',
      primaryGoal: 'Join the early access list',
      successCondition: { type: 'url', expectedUrl: `${origin}/welcome` },
      actionProvider: provider
    });

    expect(result.status).toBe('completed');
    expect(result.deterministicCompleted).toBe(true);
    expect(result.terminationReason).toBe('DETERMINISTIC_SUCCESS');
    expect(result.steps.some((step) => step.actionType === 'type')).toBe(true);
    expect(result.steps.some((step) => step.currentUrl === `${origin}/welcome`)).toBe(true);
  });

  it('falls back safely when the provider proposes an unknown element', async () => {
    const provider: AiProvider = {
      kind: 'openai',
      generatePersonas: vi.fn(),
      nextAction: vi.fn(async () => ({ type: 'click', elementId: 'pm-999' }))
    };

    const result = await runGenericBrowserScenario({
      sessionId: 'session-generic-invalid',
      startingUrl: origin,
      allowedOrigin: origin,
      persona: deterministicPersonas(1)[0]!,
      maxSteps: 3,
      maxDurationMs: 20_000,
      artifactsDir,
      productName: 'Launchly',
      productDescription: 'A workspace for small teams preparing to launch.',
      targetCustomer: 'Small-business owners',
      primaryGoal: 'Join the early access list',
      successCondition: { type: 'url', expectedUrl: `${origin}/welcome` },
      actionProvider: provider
    });

    expect(result.status).toBe('completed');
    expect(result.deterministicCompleted).toBe(false);
    expect(result.steps.some((step) => step.failureCode === 'UNKNOWN_ELEMENT')).toBe(true);
  });
});
