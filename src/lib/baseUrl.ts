/**
 * Get the public URL base for the app from the request headers
 * (fallback to NEXTAUTH_URL env, fallback to localhost).
 */
export function appBaseUrl(req: Request): string {
  const envUrl = process.env.NEXTAUTH_URL;
  if (envUrl) return envUrl.replace(/\/$/, '');
  const proto = req.headers.get('x-forwarded-proto') ?? 'http';
  const host = req.headers.get('host') ?? 'localhost:3000';
  return `${proto}://${host}`;
}
