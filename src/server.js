import { createApp } from './app.js';
import { runMigrations } from './db/index.js';

runMigrations();

const app = createApp();
const port = Number(process.env.PORT || 3000);

app.listen(port, () => {
  console.log(`Widget platform listening on http://localhost:${port}`);
  console.log(`Health check: http://localhost:${port}/healthz`);
});
