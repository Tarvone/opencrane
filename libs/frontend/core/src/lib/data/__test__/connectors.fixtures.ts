import { Connector, ConnectorCategory, ConnectorMutation, ConnectorMutationFixture, ConnectorMutationRequest, ConnectorMutationResult, ConnectorMutationOutcome } from "../../models/connector.types.js";

/** Complete connector catalogue shown by the installed list and marketplace. */
export const CONNECTORS_FIXTURE: readonly Connector[] =
[
	{ id: "cognee", name: "Cognee Search", category: ConnectorCategory.Memory, description: "Search workspace memory and connected knowledge graphs.", version: "2.4.1", installed: true, enabled: true, canManage: true },
	{ id: "github", name: "GitHub", category: ConnectorCategory.Dev, description: "Read repositories, issues, pull requests, and actions.", version: "1.2.0", installed: true, enabled: true, canManage: true },
	{ id: "gcal", name: "Google Calendar", category: ConnectorCategory.Productivity, description: "Read calendars and coordinate workspace events.", version: "3.0.0", installed: true, enabled: true, canManage: true },
	{ id: "slack", name: "Slack", category: ConnectorCategory.Comms, description: "Read channels and collaborate with workspace teams.", version: "2.1.0", installed: true, enabled: false, canManage: false },
	{ id: "browser", name: "Web Browser", category: ConnectorCategory.Research, description: "Research public web pages and retrieve source material.", version: "1.5.2", installed: true, enabled: true, canManage: false },
	{ id: "gl", name: "GitLab", category: ConnectorCategory.Dev, description: "Read repos, open MRs, trigger CI pipelines.", version: "1.0.0", installed: false, enabled: false, canManage: true },
	{ id: "linear", name: "Linear", category: ConnectorCategory.Dev, description: "Manage issues, projects, and cycles.", version: "0.9.2", installed: false, enabled: false, canManage: true },
	{ id: "notion", name: "Notion", category: ConnectorCategory.Productivity, description: "Read and write Notion pages and databases.", version: "2.0.1", installed: false, enabled: false, canManage: true },
	{ id: "perplexity", name: "Perplexity", category: ConnectorCategory.Research, description: "Real-time web research with citations.", version: "1.1.0", installed: false, enabled: false, canManage: false },
	{ id: "sql", name: "SQL Query", category: ConnectorCategory.Data, description: "Run read-only queries against connected databases.", version: "1.3.0", installed: false, enabled: false, canManage: false }
];

/** Marketplace categories in the authoritative handoff order. */
export const CONNECTOR_CATEGORIES_FIXTURE: readonly ("All" | ConnectorCategory)[] =
[
	"All",
	ConnectorCategory.Memory,
	ConnectorCategory.Dev,
	ConnectorCategory.Productivity,
	ConnectorCategory.Comms,
	ConnectorCategory.Research,
	ConnectorCategory.Data
];

/** Success outcomes used by the interactive mock in normal browsing. */
export const CONNECTOR_SUCCESS_MUTATIONS_FIXTURE: readonly ConnectorMutationFixture[] = Array.from({ length: 32 }, function successFixture(): ConnectorMutationFixture
{
	return { result: { outcome: ConnectorMutationOutcome.Success, message: "Connector updated." } };
});

/** Deterministic queued connector mutation harness with no remote registry dependency. */
export class MockConnectorMutation implements ConnectorMutation
{
	/** Number of attempted mutations, including a pending attempt. */
	public callCount = 0;

	/** Requests captured in their original order. */
	public readonly capturedRequests: ConnectorMutationRequest[] = [];

	/** Ordered outcomes consumed one per mutation attempt. */
	private readonly _fixtures: readonly ConnectorMutationFixture[];

	/** Create a connector mutation harness from an explicit outcome queue. */
	public constructor(fixtures: readonly ConnectorMutationFixture[])
	{
		this._fixtures = fixtures;
	}

	/** Capture a request and resolve its configured deterministic result. */
	public async mutate(request: ConnectorMutationRequest): Promise<ConnectorMutationResult>
	{
		// 1. Capture an immutable request so later UI updates cannot rewrite test evidence.
		this.callCount += 1;
		this.capturedRequests.push(structuredClone(request));

		// 2. Select the explicit outcome so mock behaviour never depends on external state.
		const fixture = this._fixtures[this.callCount - 1];
		if (fixture === undefined) throw new Error(`No connector mutation fixture configured for attempt ${this.callCount}.`);

		// 3. Preserve the pending window so duplicate-action locking remains testable.
		await new Promise<void>(function waitForFixture(resolve): void
		{
			setTimeout(function deliverFixture(): void { resolve(); }, fixture.delayMilliseconds ?? 0);
		});

		return structuredClone(fixture.result);
	}
}
