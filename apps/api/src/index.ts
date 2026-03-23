import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";

import { env } from "./config/env";
import { authRouter } from "./routes/auth";
import { studentRouter } from "./routes/student";
import { trainerRouter } from "./routes/trainer";
import { adminRouter } from "./routes/admin";
import { metaRouter } from "./routes/meta";

const app = express();

app.use(helmet());

const allowedOrigins = env.CORS_ORIGIN.split(",").map((o) => o.trim());
app.use(
  cors({
    origin(requestOrigin, callback) {
      if (!requestOrigin || allowedOrigins.includes(requestOrigin)) {
        callback(null, requestOrigin ?? true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true
  })
);
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "tech2high-api" });
});

app.use("/api/auth", authRouter);
app.use("/api/meta", metaRouter);
app.use("/api/student", studentRouter);
app.use("/api/trainer", trainerRouter);
app.use("/api/admin", adminRouter);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled error", error);
  res.status(500).json({ message: "Internal server error" });
});

app.listen(env.API_PORT, () => {
  console.log(`API server running on port ${env.API_PORT}`);
});
