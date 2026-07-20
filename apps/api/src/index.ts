// Load a local .env (host / non-Docker runs) before anything reads process.env.
// In Docker the vars come from compose and this is a harmless no-op — dotenv
// never overrides values already present in the environment.
import 'dotenv/config';
import { createApp } from './app';
import { env } from './config/env';

createApp().listen(env.PORT, () => {
  console.log(`[api] listening on port ${env.PORT}`);
});
