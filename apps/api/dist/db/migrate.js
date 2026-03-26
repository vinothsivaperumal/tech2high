"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const client_1 = require("./client");
async function migrate() {
    const schemaPath = node_path_1.default.resolve(__dirname, "schema.sql");
    const sql = await promises_1.default.readFile(schemaPath, "utf8");
    await client_1.pool.query(sql);
    await client_1.pool.end();
    console.log("Database schema applied successfully.");
}
migrate().catch(async (error) => {
    console.error("Failed to apply database schema.", error);
    await client_1.pool.end();
    process.exit(1);
});
