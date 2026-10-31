import './env.js';
import path from 'path';
import { fileURLToPath } from 'url';

import { createAnonymousApp } from './anonymousApp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const clientDist = path.join(__dirname, '..', 'client', 'dist');
const app = createAnonymousApp({ clientDist });

app.listen(PORT, () => {
  console.log(`Anonymous catalog server running on port ${PORT}`);
});
