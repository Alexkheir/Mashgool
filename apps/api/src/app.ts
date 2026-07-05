import cors from 'cors';
import express from 'express';
import { router } from './routes';

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: process.env.ALLOWED_ORIGIN ?? 'http://localhost:3000',
      credentials: true
    })
  );
  app.use(express.json());

  app.use('/api/v1', router);

  return app;
}
