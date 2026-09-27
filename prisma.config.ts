import "dotenv/config";
import { defineConfig, env } from "prisma/config";
import { PrismaSqlite } from "@prisma/adapter-better-sqlite3";

const usePostgres = process.env.DATABASE_URL && process.env.DATABASE_URL.includes("postgresql");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  ...(usePostgres || true
    ? {
        datasource: {
          url: env("DATABASE_URL"),
        },
      }
    : {
        datasource: {
          url: "sqlite.db",
        },
        experimental: {
          adapter: new PrismaSqlite("sqlite.db"),
        },
      }),
});
