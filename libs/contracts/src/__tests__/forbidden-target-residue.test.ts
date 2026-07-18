import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("target contract residue", function ()
{
  it("contains no retired product contract vocabulary", function ()
  {
    const targetFiles = ["src/approval.types.ts", "src/memory.types.ts", "src/run-input-snapshot.types.ts", "src/runtime-assignment.types.ts"];
    const retiredPatterns = ["OpenClaw", "SessionScope", "pod-token", "S3Client", "blue-green", "dual write", "reverse bridge"];

    for (const targetFile of targetFiles)
    {
      const source = readFileSync(join(process.cwd(), targetFile), "utf8");

      for (const retiredPattern of retiredPatterns)
      {
        expect(source).not.toContain(retiredPattern);
      }
    }
  });
});
