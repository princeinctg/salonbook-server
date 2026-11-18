import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { ENV } from "./config/env";
import { connectDB } from "./config/database";

import authRoutes from "./routes/auth.routes";
import serviceRoutes from "./routes/service.routes";
import appointmentRoutes from "./routes/appointment.routes";
import paymentRoutes from "./routes/payment.routes";
import dashboardRoutes from "./routes/dashboard.routes";

export function createApp() {
  const app = express();

  // Basic security and logging
  app.use(helmet());
  app.use(morgan("dev"));

  // CORS configuration
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        const allowedOrigins = [
          ENV.CLIENT_URL,
          "http://localhost:3000",
          "http://127.0.0.1:3000",
        ];
        if (
          allowedOrigins.includes(origin) ||
          origin.endsWith(".vercel.app") ||
          origin.endsWith(".netlify.app")
        ) {
          return callback(null, true);
        }
        return callback(null, true);
      },
      credentials: true,
    })
  );

  // Raw body for Stripe Webhook; JSON body for other routes
  app.use((req, res, next) => {
    if (req.originalUrl === "/api/payments/webhook") {
      express.raw({ type: "application/json" })(req, res, next);
    } else {
      express.json({ limit: "10mb" })(req, res, next);
    }
  });

  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // Health routes
  app.get(["/health", "/api/health"], (req: Request, res: Response) => {
    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "SalonBook API Server",
      environment: ENV.NODE_ENV,
    });
  });

  // Mount API feature routes
  app.use("/api/auth", authRoutes);
  app.use("/api/services", serviceRoutes);
  app.use("/api/appointments", appointmentRoutes);
  app.use("/api/payments", paymentRoutes);
  app.use("/api/dashboard", dashboardRoutes);

  // 404 Route handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      message: `Endpoint not found: ${req.method} ${req.originalUrl}`,
    });
  });

  // Global Error Handler
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error("[Global Error Handler]:", err);
    res.status(err.status || 500).json({
      success: false,
      message: err.message || "Internal Server Error",
      error: ENV.NODE_ENV === "development" ? err.stack : undefined,
    });
  });

  return app;
}

// Server startup if run directly or via tsx/node
if (
  require.main === module ||
  process.argv[1]?.includes("src/index.ts") ||
  process.argv[1]?.includes("src\\index.ts") ||
  process.argv[1]?.endsWith("index.ts") ||
  process.argv[1]?.endsWith("index.js")
) {
  const app = createApp();
  connectDB()
    .then(() => {
      app.listen(ENV.PORT, () => {
        console.log(`[SalonBook API] Server running on port ${ENV.PORT} (${ENV.NODE_ENV})`);
      });
    })
    .catch((err) => {
      console.error("[SalonBook API] Database connection failed at startup:", err.message);
    });
}
