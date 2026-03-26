"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const env_1 = require("./config/env");
const auth_1 = require("./routes/auth");
const student_1 = require("./routes/student");
const trainer_1 = require("./routes/trainer");
const admin_1 = require("./routes/admin");
const meta_1 = require("./routes/meta");
const app = (0, express_1.default)();
app.use((0, helmet_1.default)());
const allowedOrigins = env_1.env.CORS_ORIGIN.split(",").map((o) => o.trim());
app.use((0, cors_1.default)({
    origin(requestOrigin, callback) {
        if (!requestOrigin || allowedOrigins.includes(requestOrigin)) {
            callback(null, requestOrigin ?? true);
        }
        else {
            callback(new Error("Not allowed by CORS"));
        }
    },
    credentials: true
}));
app.use(express_1.default.json({ limit: "5mb" }));
app.use(express_1.default.urlencoded({ extended: true }));
app.use((0, morgan_1.default)("dev"));
app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "tech2high-api" });
});
app.use("/api/auth", auth_1.authRouter);
app.use("/api/meta", meta_1.metaRouter);
app.use("/api/student", student_1.studentRouter);
app.use("/api/trainer", trainer_1.trainerRouter);
app.use("/api/admin", admin_1.adminRouter);
app.use((error, _req, res, _next) => {
    console.error("Unhandled error", error);
    res.status(500).json({ message: "Internal server error" });
});
app.listen(env_1.env.API_PORT, () => {
    console.log(`API server running on port ${env_1.env.API_PORT}`);
});
