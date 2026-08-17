export default () => ({
  port: parseInt(process.env.PORT ?? '4000', 10),
  mongoUri: process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/medicore_dev?replicaSet=rs0',
  jwt: {
    secret: process.env.JWT_SECRET ?? 'dev-only-insecure-secret-change-me',
    // Default: 1 day, in seconds.
    expiresInSeconds: parseInt(process.env.JWT_EXPIRES_IN_SECONDS ?? '86400', 10),
  },
  // Comma-separated allow-list. Every browser-based client origin must be listed
  // here explicitly — the API never reflects an arbitrary request origin.
  corsOrigins: (
    process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:1420,http://localhost:8081'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  platformAdmin: {
    tenantName: process.env.PLATFORM_TENANT_NAME ?? 'Medicore Platform',
    email: process.env.PLATFORM_ADMIN_EMAIL,
    password: process.env.PLATFORM_ADMIN_PASSWORD,
  },
});
