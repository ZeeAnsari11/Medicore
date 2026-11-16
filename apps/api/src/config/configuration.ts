const DEV_JWT_SECRET = 'dev-only-insecure-secret-change-me';
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI must be set in production');
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === DEV_JWT_SECRET) {
    throw new Error('JWT_SECRET must be set to a strong, non-default value in production');
  }
}

export default () => ({
  port: parseInt(process.env.PORT ?? '4000', 10),
  mongoUri: process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/medicore_dev?replicaSet=rs0',
  jwt: {
    secret: process.env.JWT_SECRET ?? DEV_JWT_SECRET,
    // Default: 1 day, in seconds.
    expiresInSeconds: parseInt(process.env.JWT_EXPIRES_IN_SECONDS ?? '86400', 10),
  },
  // Comma-separated allow-list. Every browser-based client origin must be listed
  // here explicitly — the API never reflects an arbitrary request origin.
  // CORS_ORIGINS is still read so existing .env files keep working.
  corsOrigins: (
    process.env.CLIENT_URL ??
    process.env.CORS_ORIGINS ??
    'http://localhost:3000,http://localhost:1420,http://localhost:8081'
  )
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean),
  platformAdmin: {
    tenantName: process.env.PLATFORM_TENANT_NAME ?? 'Medicore Platform',
    // PLATFORM_ADMIN_EMAIL is still read so existing .env files keep working
    username: process.env.PLATFORM_ADMIN_USERNAME ?? process.env.PLATFORM_ADMIN_EMAIL,
    password: process.env.PLATFORM_ADMIN_PASSWORD,
  },
});
