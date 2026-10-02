import type { ComparisonResults } from "@domain/types";
import { EscapeDialect, escapeFor } from "./escaping";

const CSV_HEADER = "repository,owner,name,stars,previous,delta,status";
const NEW_LINE = "\n";

const escapeCsvField = escapeFor(EscapeDialect.CSV);

const RepoStatus = {
	NEW: "new",
	REMOVED: "removed",
	ACTIVE: "active",
} as const;

type RepoStatus = (typeof RepoStatus)[keyof typeof RepoStatus];

function repoStatus(repo: { isNew: boolean; isRemoved: boolean }): RepoStatus {
	if (repo.isNew) return RepoStatus.NEW;
	if (repo.isRemoved) return RepoStatus.REMOVED;

	return RepoStatus.ACTIVE;
}

export function generateCsvReport({ repos }: ComparisonResults): string {
	const rows = repos.map((repo) =>
		[
			escapeCsvField(repo.fullName),
			escapeCsvField(repo.owner),
			escapeCsvField(repo.name),
			repo.current,
			repo.previous ?? "",
			repo.delta,
			repoStatus(repo),
		].join(","),
	);

	return [CSV_HEADER, ...rows].join(NEW_LINE);
}
