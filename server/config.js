import { readFileSync, statSync } from 'node:fs';
export function secretValue(name, env = process.env) {
  if (env[name] && env[`${name}_FILE`])
    throw new Error(`Set only ${name} or ${name}_FILE, not both.`);
  const path = env[`${name}_FILE`];
  if (!path) return env[name];
  const file = statSync(path);
  if (!file.isFile()) throw new Error(`${name}_FILE must point to a regular file.`);
  return readFileSync(path, 'utf8').trim();
}
export function databaseConfig(
  url,
  { env = process.env, production = env.NODE_ENV === 'production' } = {},
) {
  const parsed = new URL(url);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol))
    throw new Error('Use a PostgreSQL connection URL.');
  // pg-connection-string can silently replace Pool.ssl when these parameters exist.
  for (const key of parsed.searchParams.keys())
    if (/^ssl/i.test(key))
      throw new Error(
        'Remove SSL parameters from DATABASE_URL. Configure DATABASE_SSL and DATABASE_CA_FILE instead.',
      );
  const ssl = env.DATABASE_SSL;
  if (ssl && !['true', 'false'].includes(ssl))
    throw new Error('DATABASE_SSL must be true or false.');
  if (
    production &&
    ssl !== 'true' &&
    !(ssl === 'false' && env.DATABASE_ALLOW_INSECURE_PRIVATE === 'true')
  )
    throw new Error(
      'Production requires verified TLS, or explicit permission for an isolated private database network.',
    );
  const password = secretValue('DATABASE_PASSWORD', env);
  if (password && parsed.password)
    throw new Error('Do not supply both a URL password and DATABASE_PASSWORD_FILE.');
  return {
    connectionString: url,
    ...(password ? { password } : {}),
    ssl:
      ssl === 'true'
        ? {
            rejectUnauthorized: true,
            ...(env.DATABASE_CA_FILE ? { ca: readFileSync(env.DATABASE_CA_FILE, 'utf8') } : {}),
          }
        : false,
    max: 10,
    connectionTimeoutMillis: 10000,
    statement_timeout: 20000,
    query_timeout: 25000,
  };
}
