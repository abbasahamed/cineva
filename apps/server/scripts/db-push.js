const { execSync } = require("child_process");
const path = require("path");

const defaultDbUrl = "file:./dev.db";
const dbUrl = process.env.DATABASE_URL || defaultDbUrl;
process.env.DATABASE_URL = dbUrl;

const isSqlite = dbUrl.startsWith("file:") || (!process.env.DATABASE_URL && process.env.NODE_ENV !== "production");
const schemaFile = isSqlite ? "schema.sqlite.prisma" : "schema.prisma";
const schemaPath = path.join(__dirname, "..", "prisma", schemaFile);

console.log(`[Prisma Push] Pushing schema with ${schemaFile}`);
execSync(`npx prisma db push --schema="${schemaPath}"`, { stdio: "inherit", env: process.env });
