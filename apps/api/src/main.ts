import { createApp } from './app.js';
import { loadConfig } from './config.js';

const cfg = loadConfig();
const app = await createApp(cfg);
const port = Number(process.env.PORT || 4000);
await app.listen(port, '127.0.0.1');
console.log(`QMenuX API → http://127.0.0.1:${port} (origin ${cfg.origins.api})`);
