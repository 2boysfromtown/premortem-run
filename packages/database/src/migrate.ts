import { migrate } from './database.js';

migrate();
process.stdout.write('PREMORTEM database migrated.\n');
