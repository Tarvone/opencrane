/** Result of the one executable Prisma migration command. */
export interface MigrationCommandResult
{
  /** Child exit status, or null when the process could not start. */
  status: number | null;
  /** Terminating signal when the child was killed before producing an exit status. */
  signal: NodeJS.Signals | null;
  /** Captured standard output, normalized to an empty string when unavailable. */
  stdout: string;
  /** Captured standard error, normalized to an empty string when unavailable. */
  stderr: string;
  /** Process-launch error when Node could not start the command. */
  error?: Error;
}

/** Injectable database availability gate used by the migration runner. */
export type DatabaseReadinessGate = (databaseUrl: string) => Promise<void>;

/** Injectable executable Prisma command used by the migration runner. */
export type MigrationCommandRunner = () => MigrationCommandResult;
