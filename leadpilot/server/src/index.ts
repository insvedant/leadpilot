import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { connectDb } from './db';
import { requireAuth } from './middleware/auth';
import { errorHandler, notFound } from './middleware/error';
import authRoutes from './routes/auth';
import geoRoutes from './routes/geo';
import searchRoutes from './routes/search';
import leadRoutes from './routes/leads';
import mailboxRoutes from './routes/mailboxes';
import campaignRoutes from './routes/campaigns';
import settingsRoutes from './routes/settings';
import unsubscribeRoutes from './routes/unsubscribe';
import { resumeGeneration } from './services/outreach';
import { startScheduler } from './services/scheduler';
import { startReplyPoller } from './services/replies';
import { resumeInterruptedEnrichment } from './services/queue';

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(
  '/api',
  rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests. Slow down for a minute.' },
  }),
);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});
app.use('/api/auth', authRoutes);
app.use('/api/geo', geoRoutes);
app.use('/api/search', requireAuth, searchRoutes);
app.use('/api/leads', requireAuth, leadRoutes);
app.use('/api/mailboxes', requireAuth, mailboxRoutes);
app.use('/api/campaigns', requireAuth, campaignRoutes);
app.use('/api/settings', requireAuth, settingsRoutes);
app.use('/api/u', unsubscribeRoutes);

app.use(notFound);
app.use(errorHandler);

async function main() {
  await connectDb();
  await resumeInterruptedEnrichment();
  await resumeGeneration();
  if (env.SCHEDULER_ENABLED) {
    startScheduler();
    startReplyPoller();
  }
  app.listen(env.PORT, () => console.log(`LeadPilot API listening on :${env.PORT}`));
}

main().catch((err) => {
  console.error('Failed to start', err);
  process.exit(1);
});
