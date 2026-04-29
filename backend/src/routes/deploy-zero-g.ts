/**
 * POST /api/deploy/0g — accepts a deployment manifest from the visual builder.
 * Returns a receipt; wire 0G Storage / compute / chain in production.
 */

import { Router, Request, Response } from "express";
import { createHash, randomUUID } from "crypto";

export function createDeployZeroGRouter(): Router {
  const router = Router();

  router.post("/0g", (req: Request, res: Response) => {
    const { manifest } = req.body ?? {};
    if (!manifest || typeof manifest !== "object") {
      return res.status(400).json({
        ok: false,
        error: { code: "INVALID_BODY", message: "manifest is required" },
      });
    }

    const manifestStr = JSON.stringify(manifest);
    const manifestHash = createHash("sha256").update(manifestStr).digest("hex");
    const deploymentId = `0g-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;

    return res.json({
      ok: true,
      manifestHash,
      deploymentId,
      addresses: {
        storage: `0x${createHash("sha256").update(manifestHash + "storage").digest("hex").slice(0, 40)}`,
        compute: `0x${createHash("sha256").update(manifestHash + "compute").digest("hex").slice(0, 40)}`,
        chain: "0x0000000000000000000000000000000000000000",
        da: "layer-available",
      },
      explorerLinks: {
        receipt: `https://chainscan.0g.ai/deployment/${deploymentId}`,
      },
    });
  });

  return router;
}
