import type { ScheduleTickResult } from "@opencrane/backend/server/agents/scheduling";

/**
 * One managed-agent schedule ticker, composed inside the control API.
 *
 * `runOnce` evaluates every enabled schedule at the given instant and admits due slots through the
 * same managed run-admission port the run-now surface uses: no new workload, process, or run-creation
 * path, and the same Kubernetes ServiceAccount privilege as the control API. Each schedule advances
 * its cursor only as far as the tick actually admitted, so a transient admission failure is retried
 * on the next pass. Starting a periodic invocation of `runOnce` is the live-Obot proof concern gated
 * under issue 337; this composition provides the wiring, not a running timer.
 */
export interface ScheduleTicker
{
	/** Evaluates every enabled schedule once at `now` and returns each schedule's tick result. */
	runOnce(now: Date): Promise<readonly { readonly scheduleId: string; readonly result: ScheduleTickResult }[]>;
}
