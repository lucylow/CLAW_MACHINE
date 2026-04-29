import { useEffect, useMemo, useState } from "react";

export type SkillSummary = {
  skillId: string;
  owner: string;
  namespace: string;
  name: string;
  description: string;
  status: "Draft" | "Active" | "Paused" | "Deprecated" | "Revoked";
  activeVersion: bigint | string | number;
  latestVersion: bigint | string | number;
  approved: boolean;
  allowPublicUse: boolean;
  pinnedTo0G: boolean;
  explorerUri: string;
  tags: string[];
  capabilityHints: string[];
  implementationAddress: string;
  metadataHash: string;
};

export function useSkillRegistry(apiBaseUrl = "/api") {
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/skills/registry/skills?limit=100`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to load skill registry");
      setSkills(
        json.data.items.map((item: any) => ({
          skillId: item.record.skillId,
          owner: item.record.owner,
          namespace: item.record.namespace,
          name: item.record.name,
          description: item.record.description,
          status: item.record.status,
          activeVersion: item.record.activeVersion,
          latestVersion: item.record.latestVersion,
          approved: item.record.approved,
          allowPublicUse: item.record.allowPublicUse,
          pinnedTo0G: item.record.pinnedTo0G,
          explorerUri: item.record.explorerUri,
          tags: item.activeVersion.tags ?? [],
          capabilityHints: item.activeVersion.capabilityHints ?? [],
          implementationAddress: item.record.implementationAddress,
          metadataHash: item.record.metadataHash,
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [apiBaseUrl]);

  const grouped = useMemo(
    () => ({
      active: skills.filter((s) => s.status === "Active"),
      draft: skills.filter((s) => s.status === "Draft"),
      paused: skills.filter((s) => s.status === "Paused"),
      deprecated: skills.filter((s) => s.status === "Deprecated" || s.status === "Revoked"),
    }),
    [skills],
  );

  return { skills, grouped, loading, error, refresh };
}
