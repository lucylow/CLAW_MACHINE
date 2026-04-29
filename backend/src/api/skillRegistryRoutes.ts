import { Router } from "express";
import type { Request, Response } from "express";
import type { SkillRegistryClient } from "../chain/skillRegistryClient";
import type { AddVersionInput, Address, Bytes32, RegisterSkillInput } from "../chain/skillRegistryTypes";

export interface SkillRegistryRouteDeps {
  client: SkillRegistryClient;
  requireAuth?: (req: Request) => Promise<{ address: Address; role?: string } | null>;
  logger?: {
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
  };
}

function isHex32(value: unknown): value is Bytes32 {
  return typeof value === "string" && /^0x[a-fA-F0-9]{64}$/.test(value);
}
function parseAddress(value: unknown): value is Address {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}
function badRequest(res: Response, message: string, details?: Record<string, unknown>) {
  return res.status(400).json({ ok: false, error: { code: "REGISTRY_BAD_REQUEST", message, details } });
}
function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
  ) as T;
}
async function maybeAuth(deps: SkillRegistryRouteDeps, req: Request) {
  if (!deps.requireAuth) return null;
  return deps.requireAuth(req);
}

export function createSkillRegistryRoutes(deps: SkillRegistryRouteDeps) {
  const router = Router();
  router.use(async (req, _res, next) => {
    deps.logger?.info("Skill registry request", { method: req.method, path: req.path });
    next();
  });

  router.get("/skills", async (req, res) => {
    try {
      const limit = req.query.limit ? BigInt(String(req.query.limit)) : 50n;
      const offset = req.query.offset ? BigInt(String(req.query.offset)) : 0n;
      const ids = await deps.client.getSkillIds(offset, limit);
      const items = [] as Awaited<ReturnType<typeof deps.client.getSkillById>>[];
      for (const id of ids.ids) items.push(await deps.client.getSkillById(id));
      return res.json(jsonSafe({ ok: true, data: { ids: ids.ids, nextOffset: ids.nextOffset, items } }));
    } catch (error) {
      deps.logger?.error("Failed to list skills", { error });
      return res.status(500).json({ ok: false, error: { code: "REGISTRY_LIST_FAILED", message: "Unable to load skills" } });
    }
  });

  router.get("/skills/search", async (req, res) => {
    try {
      const owner = req.query.owner ? String(req.query.owner) : undefined;
      if (owner && !parseAddress(owner)) return badRequest(res, "owner must be a hex address");
      const limit = req.query.limit ? BigInt(String(req.query.limit)) : 50n;
      const data = owner ? await deps.client.searchByOwner(owner, limit) : await deps.client.searchAll(limit);
      return res.json(jsonSafe({ ok: true, data }));
    } catch (error) {
      deps.logger?.error("Failed to search skills", { error });
      return res.status(500).json({ ok: false, error: { code: "REGISTRY_SEARCH_FAILED", message: "Unable to search skills" } });
    }
  });

  router.get("/skills/owner/:owner", async (req, res) => {
    try {
      const owner = req.params.owner;
      if (!parseAddress(owner)) return badRequest(res, "owner must be a hex address");
      const limit = req.query.limit ? BigInt(String(req.query.limit)) : 50n;
      const offset = req.query.offset ? BigInt(String(req.query.offset)) : 0n;
      const ids = await deps.client.getSkillsByOwner(owner, offset, limit);
      const items = [] as Awaited<ReturnType<typeof deps.client.getSkillById>>[];
      for (const id of ids.ids) items.push(await deps.client.getSkillById(id));
      return res.json(jsonSafe({ ok: true, data: { ids: ids.ids, nextOffset: ids.nextOffset, items } }));
    } catch (error) {
      deps.logger?.error("Failed to load owner skills", { error });
      return res.status(500).json({ ok: false, error: { code: "REGISTRY_OWNER_LOOKUP_FAILED", message: "Unable to load owner skills" } });
    }
  });

  router.get("/skills/:skillId", async (req, res) => {
    try {
      const { skillId } = req.params;
      if (!isHex32(skillId)) return badRequest(res, "skillId must be a 32-byte hex string");
      return res.json(jsonSafe({ ok: true, data: await deps.client.getSkillById(skillId) }));
    } catch (error) {
      deps.logger?.error("Failed to load skill", { error });
      return res.status(500).json({ ok: false, error: { code: "REGISTRY_LOOKUP_FAILED", message: "Unable to load skill" } });
    }
  });

  router.post("/skills/register", async (req, res) => {
    try {
      const auth = await maybeAuth(deps, req);
      const body = req.body as Partial<RegisterSkillInput>;
      if (!auth?.address) return res.status(401).json({ ok: false, error: { code: "AUTH_REQUIRED", message: "Authentication required" } });
      if (!body.owner || !parseAddress(body.owner)) return badRequest(res, "owner is required");
      if (!body.namespace || !body.name) return badRequest(res, "namespace and name are required");
      if (!isHex32(body.inputSchemaHash) || !isHex32(body.outputSchemaHash) || !isHex32(body.codeHash) || !isHex32(body.metadataHash)) {
        return badRequest(res, "schema hashes must be 32-byte hex values");
      }
      if (!parseAddress(body.implementationAddress)) return badRequest(res, "implementationAddress is required");

      const input: RegisterSkillInput = {
        owner: body.owner,
        namespace: body.namespace,
        name: body.name,
        description: body.description ?? "",
        implementationUri: body.implementationUri ?? "",
        metadataUri: body.metadataUri ?? "",
        storageUri: body.storageUri ?? "",
        computeModel: body.computeModel ?? "sealed",
        entrypoint: body.entrypoint ?? "main",
        inputSchemaHash: body.inputSchemaHash,
        outputSchemaHash: body.outputSchemaHash,
        codeHash: body.codeHash,
        requiresWallet: Boolean(body.requiresWallet),
        requiresApproval: Boolean(body.requiresApproval),
        publicUse: Boolean(body.publicUse),
        feeBps: BigInt(String(body.feeBps ?? 0)),
        pinnedStorageUri: body.pinnedStorageUri ?? "",
        pinnedComputeUri: body.pinnedComputeUri ?? "",
        explorerUri: body.explorerUri ?? "",
        implementationAddress: body.implementationAddress,
        metadataHash: body.metadataHash,
        tags: Array.isArray(body.tags) ? body.tags : [],
        capabilityHints: Array.isArray(body.capabilityHints) ? body.capabilityHints : [],
      };

      const skillId =
        auth.address.toLowerCase() === body.owner.toLowerCase()
          ? await deps.client.registerSkill(input)
          : await deps.client.registerSkillForOwner(input);

      return res.json({ ok: true, data: { skillId } });
    } catch (error) {
      deps.logger?.error("Failed to register skill", { error });
      return res.status(500).json({ ok: false, error: { code: "REGISTRY_REGISTER_FAILED", message: error instanceof Error ? error.message : "Unable to register skill" } });
    }
  });

  router.post("/skills/:skillId/version", async (req, res) => {
    try {
      const { skillId } = req.params;
      if (!isHex32(skillId)) return badRequest(res, "skillId must be a 32-byte hex string");
      const body = req.body as Partial<AddVersionInput>;
      if (!isHex32(body.inputSchemaHash) || !isHex32(body.outputSchemaHash) || !isHex32(body.metadataHash)) return badRequest(res, "required hashes are missing");
      if (!parseAddress(body.implementationAddress)) return badRequest(res, "implementationAddress is required");

      const input: AddVersionInput = {
        implementationUri: body.implementationUri ?? "",
        metadataUri: body.metadataUri ?? "",
        storageUri: body.storageUri ?? "",
        computeModel: body.computeModel ?? "sealed",
        entrypoint: body.entrypoint ?? "main",
        inputSchemaHash: body.inputSchemaHash,
        outputSchemaHash: body.outputSchemaHash,
        codeHash: body.codeHash ?? body.inputSchemaHash,
        requiresWallet: Boolean(body.requiresWallet),
        requiresApproval: Boolean(body.requiresApproval),
        publicUse: Boolean(body.publicUse),
        implementationAddress: body.implementationAddress,
        metadataHash: body.metadataHash,
        tags: Array.isArray(body.tags) ? body.tags : [],
        capabilityHints: Array.isArray(body.capabilityHints) ? body.capabilityHints : [],
      };

      const version = await deps.client.addVersion(skillId, input);
      return res.json(jsonSafe({ ok: true, data: { skillId, version } }));
    } catch (error) {
      deps.logger?.error("Failed to add version", { error });
      return res.status(500).json({ ok: false, error: { code: "REGISTRY_VERSION_ADD_FAILED", message: error instanceof Error ? error.message : "Unable to add version" } });
    }
  });

  router.post("/skills/:skillId/activate", async (req, res) => {
    try {
      const { skillId } = req.params;
      if (!isHex32(skillId)) return badRequest(res, "skillId must be a 32-byte hex string");
      const version = BigInt(String(req.body.version ?? 1));
      await deps.client.activateVersion(skillId, version);
      return res.json(jsonSafe({ ok: true, data: { skillId, version } }));
    } catch (error) {
      deps.logger?.error("Failed to activate version", { error });
      return res.status(500).json({ ok: false, error: { code: "REGISTRY_ACTIVATE_FAILED", message: error instanceof Error ? error.message : "Unable to activate version" } });
    }
  });

  router.post("/skills/:skillId/approve", async (req, res) => {
    try {
      const { skillId } = req.params;
      if (!isHex32(skillId)) return badRequest(res, "skillId must be a 32-byte hex string");
      const approved = Boolean(req.body.approved);
      await deps.client.approveSkill(skillId, approved);
      return res.json({ ok: true, data: { skillId, approved } });
    } catch (error) {
      deps.logger?.error("Failed to approve skill", { error });
      return res.status(500).json({ ok: false, error: { code: "REGISTRY_APPROVAL_FAILED", message: error instanceof Error ? error.message : "Unable to approve skill" } });
    }
  });

  router.post("/skills/:skillId/usage", async (req, res) => {
    try {
      const { skillId } = req.params;
      if (!isHex32(skillId)) return badRequest(res, "skillId must be a 32-byte hex string");
      const success = Boolean(req.body.success);
      const latencyMs = BigInt(String(req.body.latencyMs ?? 0));
      const runHash = isHex32(req.body.runHash) ? req.body.runHash : (("0x" + "0".repeat(64)) as Bytes32);
      await deps.client.reportUsage(skillId, success, latencyMs, runHash);
      return res.json(jsonSafe({ ok: true, data: { skillId, success, latencyMs, runHash } }));
    } catch (error) {
      deps.logger?.error("Failed to report usage", { error });
      return res.status(500).json({ ok: false, error: { code: "REGISTRY_USAGE_FAILED", message: error instanceof Error ? error.message : "Unable to report usage" } });
    }
  });

  return router;
}
