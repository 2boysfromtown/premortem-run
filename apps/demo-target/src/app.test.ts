import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createDemoApp } from './app.js';

describe('demo target', () => {
  it('renders a realistic launch page with browser-observable seeded issues', async () => {
    const response = await request(createDemoApp()).get('/');

    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toContain('href="/pricing"');
    expect(response.text).toContain('name="workEmail"');
    expect(response.text).not.toMatch(/<label[^>]*for="workEmail"/);
    expect(response.text).toContain('console.error(');
    expect(response.text).toContain('fetch("/api/availability")');
    expect(response.text).toContain('width: 920px');
    expect(response.text).toContain('@media (max-width: 640px)');
    expect(response.text).toContain('display: none');
  });

  it('keeps the advertised pricing navigation broken', async () => {
    const response = await request(createDemoApp()).get('/pricing');

    expect(response.status).toBe(404);
  });

  it('returns a genuine failed request for browser network capture', async () => {
    const response = await request(createDemoApp()).get('/api/availability');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'Availability service unavailable' });
  });

  it('emits a deterministic conversion acknowledgement after valid signup', async () => {
    const response = await request(createDemoApp())
      .post('/api/signup')
      .send({ workEmail: 'founder@example.com' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      event: 'premortem:conversion',
      success: true,
      successPath: '/welcome'
    });
  });

  it('does not emit conversion success for malformed signup data', async () => {
    const response = await request(createDemoApp())
      .post('/api/signup')
      .send({ workEmail: 'not-an-email' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'A valid work email is required' });
  });

  it('renders deterministic confirmation text on the success URL', async () => {
    const response = await request(createDemoApp()).get('/welcome');

    expect(response.status).toBe(200);
    expect(response.text).toContain('You are on the early access list');
    expect(response.text).toContain('data-premortem-success="true"');
  });
});
