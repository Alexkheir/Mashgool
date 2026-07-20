import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { env } from './config/env';
import { router } from './routes';
import { errorHandler } from './middleware/error.middleware';

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: env.ALLOWED_ORIGIN,
      credentials: true // required so the browser sends/receives the auth cookie
    })
  );
  app.use(express.json());
  app.use(cookieParser());

  app.use('/api/v1', router);

  // Global error handler — must be registered after the routes.
  app.use(errorHandler);

  return app;
}
