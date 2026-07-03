import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { AwarenessClient } from "@opencrane/awareness";
import type { CogneeSearchHit, CogneeSearchTransport } from "@opencrane/awareness";

import { _FormatAwarenessResult } from "../format.js";
import { _BuildAwarenessClientFromEnv } from "../memory-tools.js";
import { _BuildOrgMemoryServer } from "../server.js";

/** Build a fake Cognee transport returning fixed rows, so tests need no live backend. */
function _fakeTransport(rows: CogneeSearchHit[]): CogneeSearchTransport
{
  return async function _search() { return rows; };
}

/** A citable hit (complete metadata → survives the SDK citation invariant). */
const _citableRow: CogneeSearchHit = {
  content: "The Q3 launch date is 15 September.",
  score: 0.9,
  datasets: ["team/platform"],
  metadata: {
    title: "Q3 Launch Plan",
    uri: "https://sharepoint/q3-plan",
    source_updated_at: "2026-06-01T00:00:00.000Z",
  },
};

/** An uncitable hit (no title/uri) — the SDK must drop it. */
const _uncitableRow: CogneeSearchHit = { content: "orphan fact", metadata: {} };

/** Wire a Client to a freshly-built org-memory server over an in-memory transport pair. */
async function _connectClient(client: AwarenessClient): Promise<Client>
{
  const server = _BuildOrgMemoryServer(client);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const mcpClient = new Client({ name: "test", version: "0.0.0" });
  await mcpClient.connect(clientTransport);
  return mcpClient;
}

describe("_BuildAwarenessClientFromEnv", function _envSuite()
{
  it("throws when COGNEE_ENDPOINT is missing", function _missing()
  {
    expect(() => _BuildAwarenessClientFromEnv({})).toThrow(/COGNEE_ENDPOINT is required/);
  });

  it("builds a client when COGNEE_ENDPOINT is set", function _present()
  {
    expect(() => _BuildAwarenessClientFromEnv({ COGNEE_ENDPOINT: "http://cognee:8000" })).not.toThrow();
  });
});

describe("_FormatAwarenessResult", function _formatSuite()
{
  it("renders each hit with its citation", async function _cited()
  {
    const aware = new AwarenessClient({ cogneeEndpoint: "http://cognee:8000", search: _fakeTransport([_citableRow]) });
    const text = _FormatAwarenessResult(await aware.query({ query: "launch date" }));
    expect(text).toContain("The Q3 launch date is 15 September.");
    expect(text).toContain("Source: Q3 Launch Plan — https://sharepoint/q3-plan");
    expect(text).toContain("team/platform");
  });

  it("discloses withheld uncitable hits instead of silently dropping them", async function _dropped()
  {
    const aware = new AwarenessClient({ cogneeEndpoint: "http://cognee:8000", search: _fakeTransport([_citableRow, _uncitableRow]) });
    const text = _FormatAwarenessResult(await aware.query({ query: "launch date" }));
    expect(text).toContain("1 uncitable result withheld");
  });

  it("reports no results without inventing content", async function _empty()
  {
    const aware = new AwarenessClient({ cogneeEndpoint: "http://cognee:8000", search: _fakeTransport([]) });
    const text = _FormatAwarenessResult(await aware.query({ query: "nothing here" }));
    expect(text).toContain("No org-memory results");
  });
});

describe("org-memory MCP surface", function _mcpSuite()
{
  it("exposes a memory_search tool over MCP", async function _lists()
  {
    const aware = new AwarenessClient({ cogneeEndpoint: "http://cognee:8000", search: _fakeTransport([_citableRow]) });
    const mcpClient = await _connectClient(aware);
    const { tools } = await mcpClient.listTools();
    expect(tools.map((t) => t.name)).toContain("memory_search");
  });

  it("returns cited org context through a memory_search call", async function _calls()
  {
    const aware = new AwarenessClient({ cogneeEndpoint: "http://cognee:8000", search: _fakeTransport([_citableRow]) });
    const mcpClient = await _connectClient(aware);
    const res = await mcpClient.callTool({ name: "memory_search", arguments: { query: "launch date" } });
    const text = (res.content as Array<{ type: string; text?: string }>).map((c) => c.text ?? "").join("\n");
    expect(text).toContain("15 September");
    expect(text).toContain("Source: Q3 Launch Plan");
    expect(res.isError).toBeFalsy();
  });

  it("surfaces a backend failure as a tool error, not a crash", async function _errors()
  {
    const failing = new AwarenessClient({
      cogneeEndpoint: "http://cognee:8000",
      search: async function _boom() { throw new Error("cognee unreachable"); },
    });
    const mcpClient = await _connectClient(failing);
    const res = await mcpClient.callTool({ name: "memory_search", arguments: { query: "x" } });
    expect(res.isError).toBe(true);
    const text = (res.content as Array<{ type: string; text?: string }>).map((c) => c.text ?? "").join("\n");
    expect(text).toContain("Org-memory search failed: cognee unreachable");
  });
});
