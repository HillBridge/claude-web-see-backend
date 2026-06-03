function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`缺少必需的环境变量 ${name}，拒绝启动（不允许使用硬编码默认密钥）`);
  }
  return v;
}

export default () => ({
  app: {
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.APP_PORT, 10) || 8083,
    name: process.env.APP_NAME || 'web-see-backend',
  },
  jwt: {
    secret: requireEnv('JWT_SECRET'),
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
  sourcemapUploadSecret: process.env.SOURCEMAP_UPLOAD_SECRET,
  minio: {
    endpoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT, 10) || 9000,
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    bucket: process.env.MINIO_BUCKET || 'sourcemaps',
  },
});
