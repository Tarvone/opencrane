/** One recalled memory fact returned by the memory gateway. */
export interface MemoryFact
{
	/** Opaque identifier minted by the gateway; never locally synthesized. */
	readonly factId: string;
	/** Stored fact text as held by the gateway. */
	readonly content: string;
}

/** Request to recall personal-memory facts for one subject within a silo. */
export interface MemoryQueryCommand
{
	/** Silo that owns the memory scope. */
	readonly siloId: string;
	/** Subject whose personal memory is being queried. */
	readonly subjectId: string;
	/** Free-text recall query. */
	readonly query: string;
	/** Upper bound on the number of facts to return. */
	readonly maxResults: number;
}

/** Facts recalled by the memory gateway for a query. */
export interface MemoryQueryResult
{
	/** Facts the gateway matched, in gateway-defined order. */
	readonly facts: readonly MemoryFact[];
}

/** Request to correct the content of one stored fact. */
export interface MemoryCorrectionCommand
{
	/** Silo that owns the memory scope. */
	readonly siloId: string;
	/** Subject whose personal memory is being corrected. */
	readonly subjectId: string;
	/** Gateway-minted fact reference to correct. */
	readonly factId: string;
	/** Replacement content to store for the fact. */
	readonly correctedContent: string;
}

/** Request to forget one stored fact. */
export interface MemoryForgetCommand
{
	/** Silo that owns the memory scope. */
	readonly siloId: string;
	/** Subject whose personal memory is being pruned. */
	readonly subjectId: string;
	/** Gateway-minted fact reference to forget. */
	readonly factId: string;
}

/** Runtime-neutral boundary for the personal-memory gateway authority. */
export interface MemoryGatewayClient
{
	/** Recalls facts for a subject and returns only gateway-originated results. */
	query(command: MemoryQueryCommand): Promise<MemoryQueryResult>;
	/** Corrects one stored fact's content remotely. */
	correct(command: MemoryCorrectionCommand): Promise<void>;
	/** Forgets one stored fact remotely. */
	forget(command: MemoryForgetCommand): Promise<void>;
}
