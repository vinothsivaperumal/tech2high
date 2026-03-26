"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const node_path_1 = __importDefault(require("node:path"));
const dotenv_1 = __importDefault(require("dotenv"));
const zod_1 = require("zod");
dotenv_1.default.config();
dotenv_1.default.config({ path: node_path_1.default.resolve(process.cwd(), "../../.env") });
const envSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(["development", "test", "production"]).default("development"),
    API_PORT: zod_1.z.coerce.number().default(4000),
    DATABASE_URL: zod_1.z.string().min(1),
    JWT_SECRET: zod_1.z.string().min(16),
    CORS_ORIGIN: zod_1.z.string().default("http://localhost:3000"),
    AWS_REGION: zod_1.z.string().min(1),
    AWS_ACCESS_KEY_ID: zod_1.z.string().min(1),
    AWS_SECRET_ACCESS_KEY: zod_1.z.string().min(1),
    AWS_SESSION_TOKEN: zod_1.z.string().default(""),
    AWS_S3_BUCKET: zod_1.z.string().min(1),
    AWS_SECURITY_GROUP_ID: zod_1.z.string().min(1),
    AWS_SECURITY_GROUP_NAME: zod_1.z.string().default("nit_tech2high_student_group"),
    SMTP_HOST: zod_1.z.string().default(""),
    SMTP_PORT: zod_1.z.coerce.number().default(587),
    SMTP_SECURE: zod_1.z.enum(["true", "false"]).default("false"),
    SMTP_USER: zod_1.z.string().default(""),
    SMTP_PASS: zod_1.z.string().default(""),
    SMTP_FROM: zod_1.z.string().default("Tech2High Portal <no-reply@tech2high.com>")
});
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
    const message = parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
    throw new Error(`Environment validation failed: ${message}`);
}
exports.env = parsed.data;
