import fs from "node:fs/promises";
import path from "node:path";

import { pool } from "./client";

async function migrate() {
  const schemaPath = path.resolve(__dirname, "schema.sql");
  const sql = await fs.readFile(schemaPath, "utf8");

  await pool.query(sql);
  await pool.end();

  console.log("Database schema applied successfully.");
}

migrate().catch(async (error) => {
  console.error("Failed to apply database schema.", error);
  await pool.end();
  process.exit(1);
});
