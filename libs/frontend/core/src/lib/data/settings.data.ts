import { SearchModeInfo } from "../models/settings.types.js";

/** Cognee search modes available per dataset. */
export const SEARCH_MODES: Record<string, SearchModeInfo> =
{
	vector: { label: "vector", hint: "Embedding similarity across chunks" },
	hybrid: { label: "hybrid", hint: "Vector + graph traversal combined" },
	graph_completion: { label: "graph_completion", hint: "LLM reasoning over extracted subgraph" },
	cypher: { label: "cypher", hint: "Direct Cypher query against graph DB" }
};
