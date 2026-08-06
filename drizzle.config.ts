// drizzle.config.ts (project root)
import { config } from "dotenv";
config({ path: ".env.local" }); // LOCAL --> DEV
//config({ path: ".env.production.local" }); // --> PRODUCTION
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./app/_lib/views-filters/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
