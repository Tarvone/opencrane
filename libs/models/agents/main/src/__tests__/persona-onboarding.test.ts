import { describe, expect, it } from "vitest";

import { __ApprovePersonaOnboarding, __ApprovePersonaRevision, __AttachPersonaDraft, __BuildPersonaRuntimeInput, __CreatePersonaDraft, __CreatePersonaOnboarding, __EditPersonaDraft, __IsPersonalSessionReady, __RetakePersonaOnboarding, __SelectSoulTemplate } from "../index.js";
import type { CreatePersonaDraftInput, PersonaInsight, PersonaInterview, PersonaInterviewQuestionSet, PersonaOnboarding, PersonaRevision, SoulTemplate } from "../index.js";

/** Reviewed question set covering every required persona-onboarding topic. */
const _QUESTION_SET: PersonaInterviewQuestionSet = {
	id: "persona-interview",
	version: 1,
	reviewedBy: "product-reviewer",
	reviewedAt: "2026-07-18T08:00:00.000Z",
	questions: [
		{ id: "relationship", category: "relationship_role", prompt: "What relationship should your assistant have with you?" },
		{ id: "tone", category: "tone_language", prompt: "Which tone and language should it use?" },
		{ id: "structure", category: "answer_structure", prompt: "How should answers be structured?" },
		{ id: "challenge", category: "challenge_support", prompt: "When should it challenge you?" },
		{ id: "initiative", category: "initiative", prompt: "How much initiative should it take?" },
		{ id: "risk", category: "approval_risk", prompt: "Which actions require approval?" },
		{ id: "habits", category: "working_habits", prompt: "How do you prefer to work?" },
		{ id: "memory", category: "memory_boundaries", prompt: "What may it remember?" },
	],
};

/** Completed interview with one answer for every reviewed question. */
const _COMPLETED_INTERVIEW: PersonaInterview = {
	id: "interview-1",
	userId: "user-1",
	questionSetId: _QUESTION_SET.id,
	questionSetVersion: _QUESTION_SET.version,
	state: "completed",
	startedAt: "2026-07-18T08:10:00.000Z",
	completedAt: "2026-07-18T08:20:00.000Z",
	answers: [
		{ id: "answer-relationship", questionId: "relationship", value: "challenging partner", answeredAt: "2026-07-18T08:11:00.000Z" },
		{ id: "answer-tone", questionId: "tone", value: "concise", answeredAt: "2026-07-18T08:12:00.000Z" },
		{ id: "answer-structure", questionId: "structure", value: "conclusion first", answeredAt: "2026-07-18T08:13:00.000Z" },
		{ id: "answer-challenge", questionId: "challenge", value: "challenge weak assumptions", answeredAt: "2026-07-18T08:14:00.000Z" },
		{ id: "answer-initiative", questionId: "initiative", value: "proactive", answeredAt: "2026-07-18T08:15:00.000Z" },
		{ id: "answer-risk", questionId: "risk", value: "approve external writes", answeredAt: "2026-07-18T08:16:00.000Z" },
		{ id: "answer-habits", questionId: "habits", value: "work in focused blocks", answeredAt: "2026-07-18T08:17:00.000Z" },
		{ id: "answer-memory", questionId: "memory", value: "remember work preferences", answeredAt: "2026-07-18T08:18:00.000Z" },
	],
};

/** Reviewed templates whose rules make the completed interview select the partner template. */
const _TEMPLATES: readonly SoulTemplate[] = [
	{
		id: "supportive-guide",
		version: 2,
		sourceName: "SOUL.md",
		content: "# Supportive guide\nOffer calm assistance.",
		selectionRules: [{ questionId: "relationship", acceptedValues: ["supportive guide"], weight: 10 }],
		reviewedBy: "product-reviewer",
		reviewedAt: "2026-07-18T08:00:00.000Z",
	},
	{
		id: "challenging-partner",
		version: 3,
		sourceName: "SOUL.md",
		content: "# Challenging partner\nBe direct and constructive.",
		selectionRules: [
			{ questionId: "relationship", acceptedValues: ["challenging partner"], weight: 10 },
			{ questionId: "challenge", acceptedValues: ["challenge weak assumptions"], weight: 5 },
		],
		reviewedBy: "product-reviewer",
		reviewedAt: "2026-07-18T08:00:00.000Z",
	},
];

/** Three explicit, provenance-linked high-signal interview insights. */
const _INSIGHTS: readonly PersonaInsight[] = [
	{
		id: "insight-1",
		category: "answer_structure",
		statement: "Lead with the conclusion.",
		provenance: { interviewId: "interview-1", questionSetId: "persona-interview", questionSetVersion: 1, questionId: "structure", answerId: "answer-structure" },
	},
	{
		id: "insight-2",
		category: "challenge_support",
		statement: "Challenge weak assumptions directly.",
		provenance: { interviewId: "interview-1", questionSetId: "persona-interview", questionSetVersion: 1, questionId: "challenge", answerId: "answer-challenge" },
	},
	{
		id: "insight-3",
		category: "approval_risk",
		statement: "Ask before making an external write.",
		provenance: { interviewId: "interview-1", questionSetId: "persona-interview", questionSetVersion: 1, questionId: "risk", answerId: "answer-risk" },
	},
];

/** Creates valid draft input with narrow overrides for negative tests. */
function _DraftInput(overrides: Partial<CreatePersonaDraftInput> = {}): CreatePersonaDraftInput
{
	return {
		personaRevisionId: "persona-revision-1",
		personaProfileId: "persona-profile-1",
		revision: 1,
		interview: _COMPLETED_INTERVIEW,
		questionSet: _QUESTION_SET,
		templates: _TEMPLATES,
		insights: _INSIGHTS,
		selectedTemplateDigest: "sha256:template-3",
		authoredBy: "user-1",
		createdAt: "2026-07-18T08:30:00.000Z",
		...overrides,
	};
}

/** Returns the successful value or fails the current test with the domain message. */
function _RequireValue<T>(result: { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string }): T
{
	if (!result.ok)
	{
		throw new Error(result.message);
	}

	return result.value;
}

/** Creates a fresh in-progress interview attempt for onboarding and retake tests. */
function _InProgressInterview(id: string): PersonaInterview
{
	return {
		id,
		userId: "user-1",
		questionSetId: _QUESTION_SET.id,
		questionSetVersion: _QUESTION_SET.version,
		state: "in_progress",
		answers: [],
		startedAt: "2026-07-18T08:00:00.000Z",
		completedAt: null,
	};
}

/** Builds onboarding in review of a valid generated draft. */
function _ReviewOnboarding(): { readonly onboarding: PersonaOnboarding; readonly draft: PersonaRevision }
{
	const started = _RequireValue(__CreatePersonaOnboarding(_InProgressInterview("interview-1")));
	const completed = { ...started, interview: _COMPLETED_INTERVIEW };
	const draft = _RequireValue(__CreatePersonaDraft(_DraftInput()));
	return { onboarding: _RequireValue(__AttachPersonaDraft(completed, draft)), draft };
}

describe("persona onboarding", function _personaOnboardingSuite()
{
	it("selects a reviewed SOUL.md template from key answers and infuses three linked insights", function _createsDraft()
	{
		const selected = _RequireValue(__SelectSoulTemplate(_COMPLETED_INTERVIEW, _QUESTION_SET, _TEMPLATES));
		expect(selected.id).toBe("challenging-partner");

		const draft = _RequireValue(__CreatePersonaDraft(_DraftInput()));
		expect(draft.state).toBe("draft");
		expect(draft.soulTemplate).toEqual({ id: "challenging-partner", version: 3, digest: "sha256:template-3" });
		expect(draft.compiledInstructions).toContain("# Challenging partner");
		expect(draft.compiledInstructions).toContain("Lead with the conclusion.");
		expect(draft.insights).toHaveLength(3);
		expect(draft.durableSoulMutationPolicy).toBe("forbidden");
	});

	it("blocks the first session until the exact current draft is user-approved", function _requiresApproval()
	{
		const { onboarding, draft } = _ReviewOnboarding();
		expect(__IsPersonalSessionReady(onboarding)).toBe(false);
		expect(__BuildPersonaRuntimeInput(draft).ok).toBe(false);

		const approved = _RequireValue(__ApprovePersonaRevision(draft, "user-1", "2026-07-18T08:40:00.000Z"));
		const ready = _RequireValue(__ApprovePersonaOnboarding(onboarding, approved));
		expect(__IsPersonalSessionReady(ready)).toBe(true);

		const runtime = _RequireValue(__BuildPersonaRuntimeInput(approved));
		expect(runtime.source).toBe("compiled_persona_revision");
		expect(runtime.durableSoulMutationPolicy).toBe("forbidden");
		expect(runtime).not.toHaveProperty("soulPath");
	});

	it("turns an explicit edit into a new draft that requires approval again", function _editsDraft()
	{
		const { onboarding, draft } = _ReviewOnboarding();
		const edited = _RequireValue(__EditPersonaDraft({
			revision: draft,
			personaRevisionId: "persona-revision-2",
			revisionNumber: 2,
			compiledInstructions: `${draft.compiledInstructions}\nUse shorter paragraphs.`,
			editedBy: "user-1",
			editedAt: "2026-07-18T08:50:00.000Z",
		}));
		expect(edited.state).toBe("draft");
		expect(edited.previousRevisionId).toBe(draft.id);
		expect(edited.approvedBy).toBeNull();
		expect(__BuildPersonaRuntimeInput(edited).ok).toBe(false);

		const editedReview = _RequireValue(__AttachPersonaDraft(onboarding, edited));
		expect(__IsPersonalSessionReady(editedReview)).toBe(false);
		const approvedEdit = _RequireValue(__ApprovePersonaRevision(edited, "user-1", "2026-07-18T08:55:00.000Z"));
		const ready = _RequireValue(__ApprovePersonaOnboarding(editedReview, approvedEdit));
		expect(__IsPersonalSessionReady(ready)).toBe(true);
	});

	it("retakes onboarding by clearing prior approval and starting a new empty interview", function _retakes()
	{
		const { onboarding, draft } = _ReviewOnboarding();
		const approved = _RequireValue(__ApprovePersonaRevision(draft, "user-1", "2026-07-18T08:40:00.000Z"));
		const ready = _RequireValue(__ApprovePersonaOnboarding(onboarding, approved));
		const retaken = _RequireValue(__RetakePersonaOnboarding(ready, _InProgressInterview("interview-2")));

		expect(retaken.state).toBe("interview");
		expect(retaken.personaRevision).toBeNull();
		expect(__IsPersonalSessionReady(retaken)).toBe(false);
	});

	it("rejects incomplete interviews, incomplete question sets, and absent template matches", function _rejectsIncompleteEvidence()
	{
		const incompleteInterview = { ..._COMPLETED_INTERVIEW, answers: _COMPLETED_INTERVIEW.answers.slice(0, 7) };
		const interviewResult = __CreatePersonaDraft(_DraftInput({ interview: incompleteInterview }));
		expect(interviewResult.ok).toBe(false);
		if (!interviewResult.ok)
		{
			expect(interviewResult.code).toBe("invalid_interview");
		}

		const incompleteQuestions = { ..._QUESTION_SET, questions: _QUESTION_SET.questions.slice(0, 7) };
		const questionResult = __CreatePersonaDraft(_DraftInput({ questionSet: incompleteQuestions }));
		expect(questionResult.ok).toBe(false);
		if (!questionResult.ok)
		{
			expect(questionResult.code).toBe("invalid_question_set");
		}

		const templateResult = __CreatePersonaDraft(_DraftInput({ templates: [_TEMPLATES[0]] }));
		expect(templateResult.ok).toBe(false);
		if (!templateResult.ok)
		{
			expect(templateResult.code).toBe("template_not_selected");
		}
	});

	it("rejects fewer than three, more than five, or falsely linked persona insights", function _rejectsInvalidInsights()
	{
		const tooFew = __CreatePersonaDraft(_DraftInput({ insights: _INSIGHTS.slice(0, 2) }));
		expect(tooFew.ok).toBe(false);

		const tooMany = __CreatePersonaDraft(_DraftInput({ insights: [..._INSIGHTS, ..._INSIGHTS, _INSIGHTS[0]] }));
		expect(tooMany.ok).toBe(false);

		const falseProvenance: PersonaInsight = {
			..._INSIGHTS[0],
			id: "false-insight",
			provenance: { ..._INSIGHTS[0].provenance, answerId: "answer-memory" },
		};
		const falseLink = __CreatePersonaDraft(_DraftInput({ insights: [falseProvenance, _INSIGHTS[1], _INSIGHTS[2]] }));
		expect(falseLink.ok).toBe(false);
		if (!falseLink.ok)
		{
			expect(falseLink.code).toBe("invalid_insights");
		}
	});

	it("rejects ambiguous template scores instead of silently choosing a default", function _rejectsAmbiguousTemplate()
	{
		const duplicate: SoulTemplate = { ..._TEMPLATES[1], id: "challenging-partner-copy" };
		const result = __SelectSoulTemplate(_COMPLETED_INTERVIEW, _QUESTION_SET, [..._TEMPLATES, duplicate]);
		expect(result.ok).toBe(false);
		if (!result.ok)
		{
			expect(result.code).toBe("ambiguous_template");
		}
	});

	it("rejects approval by a different user and malformed retake attempts", function _rejectsWrongActorAndRetake()
	{
		const { onboarding, draft } = _ReviewOnboarding();
		const otherApproval = _RequireValue(__ApprovePersonaRevision(draft, "user-2", "2026-07-18T08:40:00.000Z"));
		expect(__ApprovePersonaOnboarding(onboarding, otherApproval).ok).toBe(false);
		expect(__RetakePersonaOnboarding(onboarding, _InProgressInterview("interview-1")).ok).toBe(false);
		expect(__CreatePersonaOnboarding(_COMPLETED_INTERVIEW).ok).toBe(false);
	});
});
