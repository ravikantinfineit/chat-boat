export interface AppConfig {
  port: number;
  isProduction: boolean;
  /** Origins allowed to call /admin, /auth and /platform with a session cookie. */
  adminOrigins: string[];
  publicBaseUrl: string;
  appSecret: string;
  anthropic: {
    apiKey: string;
    model: string;
    /**
     * Opus 5's safety classifiers can decline a request (HTTP 200 with
     * stop_reason "refusal"). When that happens we re-run the turn once on this
     * model rather than showing the customer a dead end.
     */
    fallbackModel: string;
  };
  database: {
    url: string;
  };
  redis: {
    url: string;
  };
}

export default (): AppConfig => ({
  port: Number(process.env.PORT ?? 3000),
  isProduction: process.env.NODE_ENV === 'production',
  adminOrigins: (process.env.ADMIN_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000',
  appSecret: process.env.APP_SECRET ?? 'insecure-dev-secret-change-me-please',
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    model: process.env.CHAT_MODEL ?? 'claude-opus-5',
    fallbackModel: process.env.CHAT_FALLBACK_MODEL ?? 'claude-opus-4-8',
  },
  database: {
    url: process.env.DATABASE_URL ?? 'postgres://diamond:diamond@localhost:5432/diamond_chatbot',
  },
  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },
});
