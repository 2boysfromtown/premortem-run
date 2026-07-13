import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PremortemService } from './application';
import { deterministicPersonas } from './contracts';

const input = {
  websiteUrl: 'http://127.0.0.1:4312',
  productName: 'Launchly',
  productDescription: 'A workspace for small teams preparing to launch.',
  targetCustomer: 'Small-business owners',
  primaryGoal: 'Join the early access list',
  successCondition: { type: 'url' as const, expectedUrl: 'http://127.0.0.1:4312/welcome' },
  simulatedCustomers: 5,
  devicePreference: 'mixed' as const,
  authorized: true as const
};

describe('PremortemService integration', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(':memory:');
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DEMO_TARGET = 'true';
    process.env.DEMO_ORIGIN = 'http://127.0.0.1:4312';
  });
  afterEach(() => db.close());

  it('creates five versioned personas/scenarios and an idempotent queued job', async () => {
    const service = new PremortemService(db, 'owner-a');
    const created = await service.createRehearsal(input);
    expect(service.getRehearsalStatus(created.rehearsalId)).toMatchObject({
      status: 'queued',
      progress: 0
    });
    expect(
      (db.prepare('SELECT COUNT(*) count FROM personas').get() as { count: number }).count
    ).toBe(5);
    expect(
      (db.prepare('SELECT COUNT(*) count FROM scenarios').get() as { count: number }).count
    ).toBe(5);
    expect((db.prepare('SELECT COUNT(*) count FROM jobs').get() as { count: number }).count).toBe(
      1
    );
  });

  it('prevents a different user from reading a rehearsal', async () => {
    const owner = new PremortemService(db, 'owner-a');
    const intruder = new PremortemService(db, 'owner-b');
    const created = await owner.createRehearsal(input);
    expect(() => intruder.getRehearsalStatus(created.rehearsalId)).toThrow('Rehearsal not found');
  });

  it('reuses the exact persona rows and scenario keys during rerun', async () => {
    const service = new PremortemService(db, 'owner-a');
    const original = await service.createRehearsal(input);
    const rerun = service.rerunRehearsal(original.rehearsalId);
    const originalPersonas = db
      .prepare(
        'SELECT persona_id,stable_key FROM scenarios WHERE rehearsal_id=? ORDER BY stable_key'
      )
      .all(original.rehearsalId);
    const rerunPersonas = db
      .prepare(
        'SELECT persona_id,stable_key FROM scenarios WHERE rehearsal_id=? ORDER BY stable_key'
      )
      .all(rerun.rehearsalId);
    expect(rerunPersonas).toEqual(originalPersonas);
  });

  it('stores validated personas from an injected AI provider', async () => {
    const generated = deterministicPersonas(5).map((persona, index) => ({
      ...persona,
      id: `generated-${index}`,
      name: `Generated persona ${index + 1}`
    }));
    const provider = {
      kind: 'openai' as const,
      generatePersonas: vi.fn(async () => generated),
      nextAction: vi.fn(async () => ({ type: 'abandon', reason: 'Not required in this test' }))
    };
    const service = new PremortemService(db, 'owner-a', provider);

    const created = await service.createRehearsal(input);
    const rows = db
      .prepare(
        'SELECT p.snapshot_json FROM personas p JOIN scenarios s ON s.persona_id=p.id WHERE s.rehearsal_id=? ORDER BY s.stable_key'
      )
      .all(created.rehearsalId) as Array<{ snapshot_json: string }>;

    expect(provider.generatePersonas).toHaveBeenCalledTimes(1);
    expect(rows.map((row): unknown => JSON.parse(row.snapshot_json) as unknown)).toEqual(
      [...generated].sort((left, right) => left.id.localeCompare(right.id))
    );
  });

  it('falls back to deterministic personas when provider output is invalid', async () => {
    const provider = {
      kind: 'openai' as const,
      generatePersonas: vi.fn(async () => [{ unsafe: 'not a persona' }]),
      nextAction: vi.fn(async () => ({ type: 'abandon', reason: 'Not required in this test' }))
    };
    const service = new PremortemService(db, 'owner-a', provider);

    const created = await service.createRehearsal(input);
    const rows = db
      .prepare(
        'SELECT p.snapshot_json FROM personas p JOIN scenarios s ON s.persona_id=p.id WHERE s.rehearsal_id=? ORDER BY s.stable_key'
      )
      .all(created.rehearsalId) as Array<{ snapshot_json: string }>;

    expect(rows.map((row): unknown => JSON.parse(row.snapshot_json) as unknown)).toEqual(
      [...deterministicPersonas(5)].sort((left, right) => left.id.localeCompare(right.id))
    );
  });
});
