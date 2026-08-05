export interface AppConfig {
  port: number;
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
    synchronize: boolean;
  };
  redis: {
    url: string;
  };
}

export default (): AppConfig => ({
  port: Number(process.env.PORT ?? 3000),
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000',
  appSecret: process.env.APP_SECRET ?? 'insecure-dev-secret-change-me-please',
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    model: process.env.CHAT_MODEL ?? 'claude-opus-5',
    fallbackModel: process.env.CHAT_FALLBACK_MODEL ?? 'claude-opus-4-8',
  },
  database: {
    url: process.env.DATABASE_URL ?? 'postgres://diamond:diamond@localhost:5432/diamond_chatbot',
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
  },
  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },
});
