import type { CreatePersonaDraftInput, EditPersonaDraftInput, PersonaFailure, PersonaInsight, PersonaInterview, PersonaInterviewCategory, PersonaInterviewQuestionSet, PersonaOnboarding, PersonaResult, PersonaRevision, PersonaRuntimeInput, PersonaSuccess, SoulTemplate } from "./persona.types.js";
import type { UserId } from "./identifiers.types.js";

/** Required category set that makes an onboarding interview product-complete. */
const _REQUIRED_CATEGORIES: readonly PersonaInterviewCategory[] = [
	"relationship_role",
	"tone_language",
	"answer_structure",
	"challenge_support",
	"initiative",
	"approval_risk",
	"working_habits",
	"memory_boundaries",
];

/** Creates a typed successful persona-domain result. */
function _success<T>(value: T): PersonaSuccess<T>
{
	return { ok: true, value };
}

/** Creates a typed failed persona-domain result. */
function _failure(code: PersonaFailure["code"], message: string): PersonaFailure
{
	return { ok: false, code, message };
}

/** Normalizes user-entered answer values for deterministic template selection. */
function _normalizeAnswer(value: string): string
{
	return value.trim().toLocaleLowerCase("en");
}

/** Validates that a question set is reviewed, versioned, unique, and category-complete. */
function _validateQuestionSet(questionSet: PersonaInterviewQuestionSet): PersonaFailure | null
{
	if (!questionSet.id.trim() || !Number.isSafeInteger(questionSet.version) || questionSet.version < 1 || !questionSet.reviewedBy.trim() || !questionSet.reviewedAt.trim())
	{
		return _failure("invalid_question_set", "The question set must have a reviewed positive version.");
	}

	const questionIds = new Set<string>();
	const categories = new Set<PersonaInterviewCategory>();
	for (const question of questionSet.questions)
	{
		if (!question.id.trim() || !question.prompt.trim() || questionIds.has(question.id))
		{
			return _failure("invalid_question_set", "Every interview question must be unique and non-empty.");
		}

		questionIds.add(question.id);
		categories.add(question.category);
	}

	const missingCategory = _REQUIRED_CATEGORIES.find(category => !categories.has(category));
	if (missingCategory !== undefined)
	{
		return _failure("invalid_question_set", `The question set does not cover ${missingCategory}.`);
	}

	return null;
}

/** Validates a completed interview against the exact reviewed question-set revision. */
function _validateInterview(interview: PersonaInterview, questionSet: PersonaInterviewQuestionSet): PersonaFailure | null
{
	if (interview.questionSetId !== questionSet.id || interview.questionSetVersion !== questionSet.version || interview.state !== "completed" || interview.completedAt === null)
	{
		return _failure("invalid_interview", "The interview must be completed against the supplied question-set revision.");
	}

	const answersByQuestion = new Map<string, string>();
	const answerIds = new Set<string>();
	for (const answer of interview.answers)
	{
		if (!answer.id.trim() || !answer.value.trim() || answerIds.has(answer.id) || answersByQuestion.has(answer.questionId))
		{
			return _failure("invalid_interview", "Every required question must have one unique non-empty answer.");
		}

		answerIds.add(answer.id);
		answersByQuestion.set(answer.questionId, answer.id);
	}

	if (answersByQuestion.size !== questionSet.questions.length || questionSet.questions.some(question => !answersByQuestion.has(question.id)))
	{
		return _failure("invalid_interview", "The completed interview must answer every question exactly once.");
	}

	return null;
}

/** Calculates the deterministic answer-match score for one reviewed template. */
function _scoreTemplate(interview: PersonaInterview, questionSet: PersonaInterviewQuestionSet, template: SoulTemplate): number | null
{
	if (!template.id.trim() || !Number.isSafeInteger(template.version) || template.version < 1 || !template.content.trim() || !template.reviewedBy.trim() || !template.reviewedAt.trim() || template.selectionRules.length === 0)
	{
		return null;
	}

	const questionIds = new Set(questionSet.questions.map(question => question.id));
	const answerValues = new Map(interview.answers.map(answer => [answer.questionId, _normalizeAnswer(answer.value)]));
	let score = 0;
	for (const rule of template.selectionRules)
	{
		if (!questionIds.has(rule.questionId) || !Number.isFinite(rule.weight) || rule.weight <= 0 || rule.acceptedValues.length === 0)
		{
			return null;
		}

		const answerValue = answerValues.get(rule.questionId);
		if (answerValue !== undefined && rule.acceptedValues.some(value => _normalizeAnswer(value) === answerValue))
		{
			score += rule.weight;
		}
	}

	return score;
}

/** Validates the required three-to-five insight set and every provenance link. */
function _validateInsights(insights: readonly PersonaInsight[], interview: PersonaInterview, questionSet: PersonaInterviewQuestionSet): PersonaFailure | null
{
	if (insights.length < 3 || insights.length > 5)
	{
		return _failure("invalid_insights", "A persona revision requires three to five explicit interview insights.");
	}

	const questions = new Map(questionSet.questions.map(question => [question.id, question]));
	const answers = new Map(interview.answers.map(answer => [answer.id, answer]));
	const insightIds = new Set<string>();
	for (const insight of insights)
	{
		const provenance = insight.provenance;
		const question = questions.get(provenance.questionId);
		const answer = answers.get(provenance.answerId);
		const commonProvenanceMatches = provenance.interviewId === interview.id && provenance.questionSetId === questionSet.id && provenance.questionSetVersion === questionSet.version;
		const answerMatches = answer !== undefined && answer.questionId === provenance.questionId;

		if (!insight.id.trim() || !insight.statement.trim() || insightIds.has(insight.id) || !commonProvenanceMatches || question === undefined || question.category !== insight.category || !answerMatches)
		{
			return _failure("invalid_insights", "Every insight must be unique and link to its exact interview question and answer.");
		}

		insightIds.add(insight.id);
	}

	return null;
}

/** Compiles the selected reviewed template and explicit insights into previewable instructions. */
function _compilePersona(template: SoulTemplate, insights: readonly PersonaInsight[]): string
{
	const renderedInsights = insights.map(insight => `- ${insight.statement}`).join("\n");
	return `${template.content.trim()}\n\n## Interview insights\n${renderedInsights}\n`;
}

/** Selects exactly one reviewed `SOUL.md` template from completed interview answers. */
export function __SelectSoulTemplate(interview: PersonaInterview, questionSet: PersonaInterviewQuestionSet, templates: readonly SoulTemplate[]): PersonaResult<SoulTemplate>
{
	const questionSetFailure = _validateQuestionSet(questionSet);
	if (questionSetFailure !== null)
	{
		return questionSetFailure;
	}

	const interviewFailure = _validateInterview(interview, questionSet);
	if (interviewFailure !== null)
	{
		return interviewFailure;
	}

	const candidates: Array<{ template: SoulTemplate; score: number }> = [];
	for (const template of templates)
	{
		const score = _scoreTemplate(interview, questionSet, template);
		if (score !== null && score > 0)
		{
			candidates.push({ template, score });
		}
	}

	if (candidates.length === 0)
	{
		return _failure("template_not_selected", "Interview answers did not select a reviewed SOUL.md template.");
	}

	candidates.sort(function _compareTemplateScore(left, right)
	{
		return right.score - left.score;
	});
	if (candidates.length > 1 && candidates[0].score === candidates[1].score)
	{
		return _failure("ambiguous_template", "Interview answers selected more than one template with the same score.");
	}

	return _success(candidates[0].template);
}

/** Creates a reviewable persona draft from one completed onboarding interview. */
export function __CreatePersonaDraft(input: CreatePersonaDraftInput): PersonaResult<PersonaRevision>
{
	// 1. Question-set review validation prevents incomplete product interviews from creating personas.
	const questionSetFailure = _validateQuestionSet(input.questionSet);
	if (questionSetFailure !== null)
	{
		return questionSetFailure;
	}

	// 2. Interview validation proves every key answer belongs to the reviewed question-set revision.
	const interviewFailure = _validateInterview(input.interview, input.questionSet);
	if (interviewFailure !== null)
	{
		return interviewFailure;
	}

	// 3. Template selection must be answer-derived and unambiguous; there is no default persona.
	const templateResult = __SelectSoulTemplate(input.interview, input.questionSet, input.templates);
	if (!templateResult.ok)
	{
		return templateResult;
	}

	// 4. Insight validation pins every infused statement to explicit interview evidence.
	const insightFailure = _validateInsights(input.insights, input.interview, input.questionSet);
	if (insightFailure !== null)
	{
		return insightFailure;
	}

	if (!input.personaRevisionId.trim() || !input.personaProfileId.trim() || !Number.isSafeInteger(input.revision) || input.revision < 1 || !input.selectedTemplateDigest.trim() || !input.authoredBy.trim() || !input.createdAt.trim())
	{
		return _failure("invalid_revision", "The persona draft requires stable identifiers, a positive version, and a template digest.");
	}

	return _success({
		id: input.personaRevisionId,
		personaProfileId: input.personaProfileId,
		revision: input.revision,
		state: "draft",
		soulTemplate: { id: templateResult.value.id, version: templateResult.value.version, digest: input.selectedTemplateDigest },
		interviewId: input.interview.id,
		insights: input.insights,
		compiledInstructions: _compilePersona(templateResult.value, input.insights),
		previousRevisionId: null,
		authoredBy: input.authoredBy,
		createdAt: input.createdAt,
		approvedBy: null,
		approvedAt: null,
		durableSoulMutationPolicy: "forbidden",
	});
}

/** Creates a new draft from an explicit user edit and clears any prior approval. */
export function __EditPersonaDraft(input: EditPersonaDraftInput): PersonaResult<PersonaRevision>
{
	if (!input.personaRevisionId.trim() || input.personaRevisionId === input.revision.id || input.revisionNumber !== input.revision.revision + 1 || !input.compiledInstructions.trim() || !input.editedBy.trim() || !input.editedAt.trim())
	{
		return _failure("invalid_revision", "An edit requires a new identifier, the next revision number, and non-empty user instructions.");
	}

	return _success({
		...input.revision,
		id: input.personaRevisionId,
		revision: input.revisionNumber,
		state: "draft",
		compiledInstructions: input.compiledInstructions,
		previousRevisionId: input.revision.id,
		authoredBy: input.editedBy,
		createdAt: input.editedAt,
		approvedBy: null,
		approvedAt: null,
	});
}

/** Approves a draft persona revision for personal-agent runtime use. */
export function __ApprovePersonaRevision(revision: PersonaRevision, approvedBy: UserId, approvedAt: string): PersonaResult<PersonaRevision>
{
	if (revision.state !== "draft" || !approvedBy.trim() || !approvedAt.trim())
	{
		return _failure("invalid_revision", "Only a draft may be approved by an identified user at a recorded instant.");
	}

	return _success({ ...revision, state: "approved", approvedBy, approvedAt });
}

/** Starts required onboarding from a fresh in-progress interview attempt. */
export function __CreatePersonaOnboarding(interview: PersonaInterview): PersonaResult<PersonaOnboarding>
{
	if (interview.state !== "in_progress" || interview.completedAt !== null || !interview.userId.trim())
	{
		return _failure("invalid_onboarding_state", "Onboarding must start from a fresh in-progress interview.");
	}

	return _success({ userId: interview.userId, state: "interview", interview, personaRevision: null });
}

/** Moves completed onboarding into user review with a generated or edited draft. */
export function __AttachPersonaDraft(onboarding: PersonaOnboarding, revision: PersonaRevision): PersonaResult<PersonaOnboarding>
{
	const canAttach = onboarding.state !== "ready" && onboarding.interview.state === "completed" && revision.state === "draft" && revision.interviewId === onboarding.interview.id && revision.authoredBy === onboarding.userId;
	if (!canAttach)
	{
		return _failure("invalid_onboarding_state", "A matching draft may only be attached after the current interview is complete.");
	}

	return _success({ ...onboarding, state: "review", personaRevision: revision });
}

/** Moves reviewed onboarding to ready after approval of its exact current draft. */
export function __ApprovePersonaOnboarding(onboarding: PersonaOnboarding, approvedRevision: PersonaRevision): PersonaResult<PersonaOnboarding>
{
	const currentRevision = onboarding.personaRevision;
	const canApprove = onboarding.state === "review" && currentRevision !== null && currentRevision.id === approvedRevision.id && approvedRevision.state === "approved" && approvedRevision.approvedBy === onboarding.userId;
	if (!canApprove)
	{
		return _failure("invalid_onboarding_state", "Onboarding requires user approval of the exact current draft.");
	}

	return _success({ ...onboarding, state: "ready", personaRevision: approvedRevision });
}

/** Restarts onboarding with a fresh interview and discards draft or ready runtime eligibility. */
export function __RetakePersonaOnboarding(onboarding: PersonaOnboarding, nextInterview: PersonaInterview): PersonaResult<PersonaOnboarding>
{
	const isFreshAttempt = nextInterview.id !== onboarding.interview.id && nextInterview.userId === onboarding.userId && nextInterview.state === "in_progress" && nextInterview.answers.length === 0 && nextInterview.completedAt === null;
	if (!isFreshAttempt)
	{
		return _failure("invalid_onboarding_state", "A retake requires a new empty in-progress interview for the same user.");
	}

	return _success({ userId: onboarding.userId, state: "interview", interview: nextInterview, personaRevision: null });
}

/** Determines whether the first personal-agent session may start. */
export function __IsPersonalSessionReady(onboarding: PersonaOnboarding): boolean
{
	return onboarding.state === "ready" && onboarding.personaRevision !== null && onboarding.personaRevision.state === "approved" && onboarding.personaRevision.approvedBy === onboarding.userId;
}

/** Builds runtime input only from an approved compiled persona revision. */
export function __BuildPersonaRuntimeInput(revision: PersonaRevision): PersonaResult<PersonaRuntimeInput>
{
	if (revision.state !== "approved" || revision.approvedBy === null || revision.approvedAt === null)
	{
		return _failure("invalid_revision", "Runtime input requires an approved persona revision.");
	}

	return _success({
		personaRevisionId: revision.id,
		compiledInstructions: revision.compiledInstructions,
		source: "compiled_persona_revision",
		durableSoulMutationPolicy: "forbidden",
	});
}
