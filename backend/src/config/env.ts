import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  jwt: {
    accessSecret: required("JWT_ACCESS_SECRET"),
    refreshSecret: required("JWT_REFRESH_SECRET"),
    resetSecret: required("JWT_RESET_SECRET"),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? "15m",
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? "7d",
    resetExpiresIn: process.env.JWT_RESET_EXPIRES_IN ?? "1h",
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  },
  supabaseStorage: {
    url: required("SUPABASE_URL"),
    serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    bucket: process.env.SUPABASE_STORAGE_BUCKET ?? "everyskill-uploads",
    kycBucket: process.env.SUPABASE_KYC_BUCKET ?? "everyskill-kyc-private",
  },
  bootstrapSuperAdmin: {
    email: process.env.SUPER_ADMIN_EMAIL,
    password: process.env.SUPER_ADMIN_PASSWORD,
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY,
    model: process.env.GROQ_MODEL ?? "llama-3.1-8b-instant",
    // FR20 — vision-capable model, distinct from the text-only model above. Override in .env if
    // your account/tier supports a different Groq vision model id.
    visionModel: process.env.GROQ_VISION_MODEL ?? "qwen/qwen3.6-27b",
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
  },
};
