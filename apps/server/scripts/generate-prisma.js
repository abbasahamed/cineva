const { execSync } = require("child_process");
const path = require("path");

const dbUrl = process.env.DATABASE_URL || "";
const isSqlite = dbUrl.startsWith("file:") || (!dbUrl && process.env.NODE_ENV !== "production");
const schemaFile = isSqlite ? "schema.sqlite.prisma" : "schema.prisma";
const schemaPath = path.join(__dirname, "..", "prisma", schemaFile);

console.log(`[Prisma Setup] Using ${schemaFile} (${isSqlite ? "SQLite" : "PostgreSQL"})`);
execSync(`npx prisma generate --schema=${schemaPath}`, { stdio: "inherit" });
