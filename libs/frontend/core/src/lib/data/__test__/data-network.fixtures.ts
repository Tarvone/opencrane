import { DataNetworkDataset, DataNetworkDatasetPresentation, EgressMutation, EgressMutationFixture, EgressMutationOutcome, EgressMutationResult } from "../../models/data-network.types.js";
import { COGNEE_DATASETS } from "./settings.fixtures.js";

/** Handoff presentation fields keyed by their existing Cognee dataset identity. */
const DATA_NETWORK_DATASET_DETAILS: Readonly<Record<string, DataNetworkDatasetPresentation>> =
{
	"ds-org": { name: "Company knowledge base", nodes: 1240 },
	"ds-dept": { name: "Team playbooks", nodes: 340 }
};

/** Workspace dataset rows projected from the existing Cognee fixture source. */
export const DATA_NETWORK_DATASETS_FIXTURE: readonly DataNetworkDataset[] = COGNEE_DATASETS.filter(function included(dataset): boolean
{
	return DATA_NETWORK_DATASET_DETAILS[dataset.id] !== undefined;
}).map(function projectDataset(dataset): DataNetworkDataset
{
	const detail = DATA_NETWORK_DATASET_DETAILS[dataset.id];
	if (detail === undefined) throw new Error(`Missing Data & Network projection for ${dataset.id}.`);
	return {
		id: dataset.id,
		name: detail.name,
		graph: "Cognee graph",
		nodes: detail.nodes,
		scope: dataset.scope,
		active: dataset.enabled
	};
});

/** Purpose options offered by the fixture-backed Add Domain form. */
export const EGRESS_PURPOSES_FIXTURE: readonly string[] = ["AI provider", "Skill connector", "Research source", "Custom domain"];

/** Repeatable success used by normal mock egress additions. */
export const EGRESS_SUCCESS_MUTATION_RESULT_FIXTURE: EgressMutationResult = { outcome: EgressMutationOutcome.Success, message: "Domain added." };

/** Deterministic queued egress mutation harness with no NetworkPolicy side effect. */
export class MockEgressMutation implements EgressMutation
{
	/** Number of attempted mutations, including a pending attempt. */
	public callCount = 0;

	/** Normalized domains captured in submission order. */
	public readonly capturedDomains: string[] = [];

	/** Ordered outcomes consumed one per attempt. */
	private readonly _fixtures: readonly EgressMutationFixture[];

	/** Optional repeatable result used after the explicit queue is exhausted. */
	private readonly _fallbackResult: EgressMutationResult | undefined;

	/** Create a fixture-backed mutation boundary from an explicit queue and optional fallback. */
	public constructor(fixtures: readonly EgressMutationFixture[], fallbackResult?: EgressMutationResult)
	{
		this._fixtures = fixtures;
		this._fallbackResult = fallbackResult;
	}

	/** Capture a domain and resolve its deterministic fixture result. */
	public async mutate(domain: string): Promise<EgressMutationResult>
	{
		// 1. Capture the normalized host so later form edits cannot rewrite test evidence.
		this.callCount += 1;
		this.capturedDomains.push(domain);

		// 2. Select an explicit result so the mock never depends on cluster state.
		const fixture = this._fixtures[this.callCount - 1];
		const result = fixture?.result ?? this._fallbackResult;
		if (result === undefined) throw new Error(`No egress mutation fixture configured for attempt ${this.callCount}.`);

		// 3. Preserve a pending window so duplicate submissions remain observable.
		await new Promise<void>(function waitForFixture(resolve): void
		{
			setTimeout(function deliverFixture(): void { resolve(); }, fixture?.delayMilliseconds ?? 0);
		});
		return structuredClone(result);
	}
}
