function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function parseAllowedOrigins(raw: string): string[] {
  return raw
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter((origin) => origin.length > 0);
}

/**
 * Fail fast if required security / LiveKit configuration is missing.
 * The backend must not start with forgeable secrets or demo credentials.
 */
export function validateEnv(): void {
  const missing: string[] = [];
  if (!process.env.JWT_SECRET?.trim()) missing.push("JWT_SECRET");
  if (!process.env.LIVEKIT_API_KEY?.trim()) missing.push("LIVEKIT_API_KEY");
  if (!process.env.LIVEKIT_API_SECRET?.trim()) missing.push("LIVEKIT_API_SECRET");
  if (!process.env.LIVEKIT_URL?.trim()) missing.push("LIVEKIT_URL");
  if (missing.length > 0) {
    console.error(
      `FATAL: Missing required environment variables: ${missing.join(
        ", "
      )}. Set them before starting the server.`
    );
    process.exit(1);
  }
}

export const config = {
  get port(): number {
    const parsed = parseInt(process.env.PORT || "4000", 10);
    return Number.isNaN(parsed) ? 4000 : parsed;
  },
  get nodeEnv(): string {
    return process.env.NODE_ENV || "development";
  },
  get databaseUrl(): string {
    return process.env.DATABASE_URL?.trim() || "./prisma/dev.db";
  },
  get clientUrl(): string {
    return this.allowedOrigins[0] || "http://localhost:3000";
  },
  get allowedOrigins(): string[] {
    const raw = process.env.CLIENT_URL?.trim() || "http://localhost:3000";
    const parsed = parseAllowedOrigins(raw);
    return parsed.length > 0 ? parsed : ["http://localhost:3000"];
  },
  get jwtSecret(): string {
    return requireEnv("JWT_SECRET");
  },
  get livekitApiKey(): string {
    return requireEnv("LIVEKIT_API_KEY");
  },
  get livekitApiSecret(): string {
    return requireEnv("LIVEKIT_API_SECRET");
  },
  get livekitUrl(): string {
    return requireEnv("LIVEKIT_URL");
  },
};
