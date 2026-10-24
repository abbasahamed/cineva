const { execSync } = require("child_process");
const path = require("path");

const dbUrl = process.env.DATABASE_URL || "";
const isSqlite = dbUrl.startsWith("file:") || (!dbUrl && process.env.NODE_ENV !== "production");
const schemaFile = isSqlite ? "schema.sqlite.prisma" : "schema.prisma";
const schemaPath = path.join(__dirname, "..", "prisma", schemaFile);

console.log(`[Prisma Push] Pushing schema with ${schemaFile}`);
execSync(`npx prisma db push --schema=${schemaPath}`, { stdio: "inherit" });
