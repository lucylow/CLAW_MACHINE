import type { FeatureFlagService } from "./types";
import { stableFlagObject } from "./util";

class InMemoryFeatureFlags implements FeatureFlagService {
  constructor(private readonly flags: Record<string, boolean> = {}) {}

  isEnabled(flag: string, defaultValue = false): boolean {
    const value = this.flags[flag];
    return typeof value === "boolean" ? value : defaultValue;
  }

  get(flag: string): boolean | undefined {
    return this.flags[flag];
  }

  set(flag: string, value: boolean): void {
    this.flags[flag] = value;
  }

  list(): Record<string, boolean> {
    return stableFlagObject(this.flags);
  }
}

export function createFeatureFlags(flags: Record<string, boolean> = {}): FeatureFlagService {
  return new InMemoryFeatureFlags(flags);
}
