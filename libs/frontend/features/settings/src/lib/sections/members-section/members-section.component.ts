import { ActivatedRoute, Router } from "@angular/router";
import { ChangeDetectionStrategy, Component, Signal, computed, inject, signal } from "@angular/core";

import { DestructiveActionPhase, DestructiveActionState, SettingsFormPhase, SettingsFormState, SettingsMutationOutcome, SettingsNavigationDecision, SettingsUnsavedNavigationConfirmation, _ConfirmSettingsNavigation, _CreateSettingsFormState, _EditSettingsForm, _ResolveSettingsForm, _SubmitSettingsForm } from "@opencrane/core";
import { DestructiveConfirmationComponent } from "@opencrane/elements/ui";

import { MEMBERS_EDITOR_FIXTURE, WORKSPACE_MEMBERS_FIXTURE, WORKSPACE_ORG_FIXTURE, WORKSPACE_PROJECTS_FIXTURE } from "./members-section.fixtures.js";
import { MembersEditorDraft, MembersEditorKind, WorkspaceMember, WorkspaceOrgRow, WorkspaceProject } from "./members-section.types.js";

/** Fixture-backed Workspace Members, organization, and editor views. */
@Component({
	selector: "wo-members-section",
	standalone: true,
	imports: [DestructiveConfirmationComponent],
	templateUrl: "./members-section.component.html",
	styleUrl: "./members-section.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class MembersSectionComponent
{
	/** Router used for preserving the Members tab across editor navigation. */
	private readonly _router = inject(Router);

	/** Activated route used to read the optional editor child route. */
	private readonly _route = inject(ActivatedRoute);

	/** One-shot escape for the explicit handoff back action. */
	private _allowMembersBack = false;

	/** Deterministic people fixtures. */
	public readonly members: readonly WorkspaceMember[] = WORKSPACE_MEMBERS_FIXTURE;

	/** Deterministic nested organization fixtures. */
	public readonly organization: readonly WorkspaceOrgRow[] = WORKSPACE_ORG_FIXTURE;

	/** Deterministic project fixtures. */
	public readonly projects: readonly WorkspaceProject[] = WORKSPACE_PROJECTS_FIXTURE;

	/** Seat limit used by the handoff threshold states. */
	public readonly seatLimit = 10;

	/** Current seat usage used to exercise the healthy and danger presentation. */
	public readonly seatUsed = 5;

	/** Form lifecycle enum exposed to the external template. */
	public readonly SettingsFormPhase = SettingsFormPhase;

	/** Active Members tab, restored from the query string when an editor closes. */
	public readonly selectedTab = signal<"people" | "org">(this._route.snapshot.queryParamMap.get("tab") === "org" ? "org" : "people");

	/** Whether a handoff add action opened a new-entity editor. */
	public readonly isNewEditor = this._route.snapshot.paramMap.get("id") === "new";

	/** Draft state for the current editor route. */
	public readonly formState = signal<SettingsFormState<MembersEditorDraft>>(this._initialEditorState());

	/** Entity pending explicit destructive confirmation. */
	public readonly deleteTarget = signal<string | null>(null);

	/** Confirmation state owned by the shared destructive dialog. */
	public readonly destructiveState = signal<DestructiveActionState>({ phase: DestructiveActionPhase.Idle });

	/** Whether the route is displaying an editor child page. */
	public readonly editorKind: Signal<MembersEditorKind | null> = computed((): MembersEditorKind | null =>
	{
		const kind = this._route.snapshot.data["editorKind"];
		return kind === "department" || kind === "team" || kind === "project" ? kind : null;
	});

	/** Department rows used by the Team editor select. */
	public readonly departments: readonly WorkspaceOrgRow[] = this.organization.filter(function departmentsOnly(row): boolean { return row.kind === "department"; });

	/** Teams belonging to the department currently open in the handoff editor. */
	public readonly editorDepartmentTeams: Signal<readonly WorkspaceOrgRow[]> = computed((): readonly WorkspaceOrgRow[] =>
	{
		const departmentId = this._route.snapshot.paramMap.get("id");
		return this.organization.filter(function belongsToDepartment(row): boolean { return row.kind === "team" && row.departmentId === departmentId; });
	});

	/** Seat usage label required by the handoff. */
	public readonly seatLabel: Signal<string> = computed((): string => `${this.seatUsed} of ${this.seatLimit}`);

	/** Invite is unavailable when the fixture reaches its capacity. */
	public readonly inviteDisabled: Signal<boolean> = computed((): boolean => this.seatUsed >= this.seatLimit);

	/** Danger styling begins at the handoff's eighty-percent threshold. */
	public readonly seatsNearLimit: Signal<boolean> = computed((): boolean => this.seatUsed / this.seatLimit >= 0.8);

	/** Route to the selected tab while retaining the current shell. */
	public selectTab(tab: "people" | "org"): void
	{
		this.selectedTab.set(tab);
		void this._router.navigate([], { relativeTo: this._route, queryParams: { tab }, queryParamsHandling: "merge" });
	}

	/** Mock the invite action with an accessible status message. */
	public invite(): void
	{
		if (this.inviteDisabled()) return;
	}

	/** Open an editor child route and preserve the selected organization tab. */
	public openEditor(kind: MembersEditorKind, id: string): void
	{
		void this._router.navigate(["/settings/workspace/members/edit", kind, id], { queryParams: { tab: "org" } });
	}

	/** Return from an editor to the Members view and retain the selected tab. */
	public goBack(): void
	{
		this._allowMembersBack = true;
		void this._router.navigate(["/settings/workspace/members"], { queryParams: { tab: "org" } });
	}

	/** Delegate unsafe editor navigation to the shared confirmation boundary. */
	public canDeactivate(confirmation: SettingsUnsavedNavigationConfirmation): SettingsNavigationDecision
	{
		if (this._allowMembersBack) return true;
		return _ConfirmSettingsNavigation(this.formState(), confirmation);
	}

	/** Update the editor draft through the shared settings-form state foundation. */
	public editName(event: Event): void
	{
		const name = (event.target as HTMLInputElement).value;
		this.formState.update(function edit(state): SettingsFormState<MembersEditorDraft>
		{
			return _EditSettingsForm(state, { ...state.draft, name }, name.trim().length === 0 ? { name: "Enter a name." } : {});
		});
	}

	/** Update the Team editor department using the shared draft lifecycle. */
	public editDepartment(event: Event): void
	{
		const department = (event.target as HTMLSelectElement).value;
		this._editDraft({ ...this.formState().draft, department });
	}

	/** Update the Project editor lifecycle status using the shared draft lifecycle. */
	public editStatus(event: Event): void
	{
		const status = (event.target as HTMLSelectElement).value as MembersEditorDraft["status"];
		this._editDraft({ ...this.formState().draft, status });
	}

	/** Toggle one member assignment in the Team editor. */
	public toggleMember(memberId: string, selected: boolean): void
	{
		const current = this.formState().draft.memberIds;
		const memberIds = selected ? [...current, memberId].filter(function unique(id, index, ids): boolean { return ids.indexOf(id) === index; }) : current.filter(function remove(id): boolean { return id !== memberId; });
		this._editDraft({ ...this.formState().draft, memberIds });
	}

	/** Submit the editor draft as a deterministic mock mutation. */
	public async save(): Promise<void>
	{
		const pending = _SubmitSettingsForm(this.formState());
		if (pending.phase !== SettingsFormPhase.Pending) return;
		this.formState.set(pending);
		await Promise.resolve();
		this.formState.update(function resolve(state): SettingsFormState<MembersEditorDraft>
		{
			return _ResolveSettingsForm(state, { outcome: SettingsMutationOutcome.Success, accepted: pending.pendingDraft, message: "Changes saved." });
		});
	}

	/** Request explicit confirmation before deleting a department, team, or project. */
	public requestDelete(name: string): void
	{
		this.deleteTarget.set(name);
		this.destructiveState.set({ phase: DestructiveActionPhase.Idle });
	}

	/** Cancel a pending destructive request. */
	public cancelDelete(): void
	{
		if (this.destructiveState().phase !== DestructiveActionPhase.Pending) this.deleteTarget.set(null);
	}

	/** Confirm a mock destructive action and announce its completion. */
	public confirmDelete(): void
	{
		if (this.deleteTarget() === null) return;
		this.destructiveState.set({ phase: DestructiveActionPhase.Success, message: "The item was deleted from this fixture." });
		this.deleteTarget.set(null);
	}

	/** Resolve the selected editor entity into its editable baseline fixture. */
	private _editorBaseline(): MembersEditorDraft
	{
		const kind = this._route.snapshot.data["editorKind"];
		const id = this._route.snapshot.paramMap.get("id");
		if (kind === "department")
		{
			const department = this.organization.find(function match(row): boolean { return row.id === id && row.kind === "department"; });
			return { ...MEMBERS_EDITOR_FIXTURE, name: department?.name ?? "" };
		}
		if (kind === "team")
		{
			const team = this.organization.find(function match(row): boolean { return row.id === id && row.kind === "team"; });
			const department = this.organization.find(function match(row): boolean { return row.id === team?.departmentId; });
			const memberIds = this.members.filter(function belongsToTeam(member): boolean { return member.team === team?.name; }).map(function identifier(member): string { return member.id; });
			return { ...MEMBERS_EDITOR_FIXTURE, name: team?.name ?? "", department: department?.name ?? "Engineering", memberIds };
		}
		if (kind === "project")
		{
			const project = this.projects.find(function match(row): boolean { return row.id === id; });
			return { ...MEMBERS_EDITOR_FIXTURE, name: project?.name ?? "", status: project?.status ?? "Active" };
		}
		return MEMBERS_EDITOR_FIXTURE;
	}

	/** Create an invalid blank state for new entities and a pristine state for existing ones. */
	private _initialEditorState(): SettingsFormState<MembersEditorDraft>
	{
		const baseline = this._editorBaseline();
		const state = _CreateSettingsFormState(baseline);
		return this.isNewEditor ? _EditSettingsForm(state, baseline, { name: "Enter a name." }) : state;
	}

	/** Apply a complete valid editor draft without duplicating state transitions. */
	private _editDraft(draft: MembersEditorDraft): void
	{
		this.formState.update(function edit(state): SettingsFormState<MembersEditorDraft>
		{
			return _EditSettingsForm(state, draft);
		});
	}
}
