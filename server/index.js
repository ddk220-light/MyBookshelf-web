import './env.js';
import path from 'path';
import { fileURLToPath } from 'url';

import { createApplication } from './application.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const clientDist = path.join(__dirname, '..', 'client', 'dist');
const app = createApplication({ clientDist });

const server = app.listen(PORT, () => {
  console.log(`Anonymous catalog server running on port ${server.address().port}`);
});
