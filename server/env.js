import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve the repository's local .env independently of the shell/workspace cwd.
// Hosting supplies process variables directly; a missing local file is harmless.
const envPath = path.resolve(fileURLToPath(import.meta.url), '../../.env');
dotenv.config({ path: envPath });
