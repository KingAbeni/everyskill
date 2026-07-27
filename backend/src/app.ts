import cors from "cors";
import express from "express";
import { errorHandler } from "./middleware/errorHandler";
import { requestLogger } from "./middleware/requestLogger";
import { authRouter } from "./modules/auth/auth.routes";
import { customerRouter } from "./modules/customer/customer.routes";
import { providerRouter } from "./modules/provider/provider.routes";
import { adminRouter } from "./modules/admin/admin.routes";
import { uploadRouter } from "./modules/upload/upload.routes";
import { categoryRouter } from "./modules/category/category.routes";
import { listingRouter } from "./modules/listing/listing.routes";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(requestLogger);

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/customers", customerRouter);
  app.use("/api/providers", providerRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/uploads", uploadRouter);
  app.use("/api/categories", categoryRouter);
  app.use("/api/listings", listingRouter);

  app.use(errorHandler);

  return app;
}
