/** One fixture-backed member contributing to workspace budget totals. */
export interface WorkspaceBudgetMember
{
	/** Stable fixture identifier. */
	id: string;
	/** Member display name. */
	name: string;
	/** Workspace role shown below the name. */
	role: string;
	/** Current monthly spend in US dollars. */
	spent: number;
	/** Avatar initials. */
	avatar: string;
	/** Paper token used for the avatar surface. */
	avatarBackground: string;
}

/** Editable workspace budget values keyed by member identifier. */
export interface WorkspaceBudgetDraft
{
	/** Per-member monthly limits in US dollars. */
	limits: Record<string, number>;
}

/** Derived organization totals displayed in the summary card. */
export interface WorkspaceBudgetTotals
{
	/** Sum of current member spend. */
	spent: number;
	/** Sum of editable member limits. */
	allocated: number;
}

/** Budget threshold state displayed at the end of each member row. */
export enum WorkspaceBudgetStatus
{
	/** Usage is below eighty percent. */
	Normal = "normal",
	/** Usage is from eighty through ninety-nine percent. */
	Warning = "warning",
	/** Usage is at or above the configured limit. */
	Exceeded = "exceeded"
}

/** Derived usage presentation for one member row. */
export interface WorkspaceBudgetUsage
{
	/** Unclamped percentage used for the text label. */
	percentage: number;
	/** Percentage clamped for the progress-bar width. */
	barPercentage: number;
	/** Threshold state. */
	status: WorkspaceBudgetStatus;
	/** Handoff-facing status label. */
	label: string;
}

/** Complete rendering model for one budget member. */
export interface WorkspaceBudgetRow extends WorkspaceBudgetMember, WorkspaceBudgetUsage
{
	/** Editable monthly limit. */
	limit: number;
}
