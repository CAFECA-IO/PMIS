import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the native SQLite driver and Prisma adapter out of the bundle so the
  // compiled .node binary is loaded via require() at runtime.
  serverExternalPackages: ["better-sqlite3", "@prisma/adapter-better-sqlite3"],
};

export default nextConfig;
