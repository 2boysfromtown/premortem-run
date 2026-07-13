import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const rehearsals = sqliteTable('rehearsals', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  targetWebsiteId: text('target_website_id').notNull(),
  sourceRehearsalId: text('source_rehearsal_id'),
  status: text('status').notNull(),
  score: integer('score'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
});

export const jobs = sqliteTable(
  'jobs',
  {
    id: text('id').primaryKey(),
    rehearsalId: text('rehearsal_id').notNull(),
    state: text('state').notNull(),
    progress: integer('progress').notNull(),
    lockToken: text('lock_token'),
    lockedAt: text('locked_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (table) => [uniqueIndex('jobs_rehearsal_unique').on(table.rehearsalId)]
);
