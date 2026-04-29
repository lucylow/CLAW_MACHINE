import { useMemo } from "react";
import { zeroG } from "../lib/0g/manager";

export function useZeroG() {
  return useMemo(
    () => ({
      ...zeroG,
      async reflect(context: string) {
        return await zeroG.compute.generateReflection(context);
      },
      async embed(text: string) {
        return await zeroG.compute.getEmbedding(text);
      },
    }),
    [],
  );
}
