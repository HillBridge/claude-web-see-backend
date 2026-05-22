export default () => ({
  app: {
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.APP_PORT, 10) || 8083,
    name: process.env.APP_NAME || 'web-see-backend',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'web-see-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || '',
    db: parseInt(process.env.REDIS_DB, 10) || 0,
  },
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
  distPath: process.env.DIST_PATH || '../dist',
});
