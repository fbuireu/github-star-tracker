import { MAX_REACHABLE_STARGAZERS } from "./constants";

export const STARGAZER_PAGE_SIZE = 100;
export const MAX_REACHABLE_PAGE = Math.floor(MAX_REACHABLE_STARGAZERS / STARGAZER_PAGE_SIZE);

interface ShouldSampleParams {
	stars: number;
	smartSampling: boolean;
	threshold: number;
}

export function shouldSample({ stars, smartSampling, threshold }: ShouldSampleParams): boolean {
	return smartSampling && stars > threshold;
}

export function reachablePages(totalStars: number): number {
	return Math.min(MAX_REACHABLE_PAGE, Math.max(1, Math.ceil(totalStars / STARGAZER_PAGE_SIZE)));
}

interface SampledPagesParams {
	totalStars: number;
	maxPages: number;
}

export function sampledPages({ totalStars, maxPages }: SampledPagesParams): number[] {
	const totalPages = reachablePages(totalStars);
	const pages = Math.max(1, maxPages);

	if (totalPages <= pages) {
		return Array.from({ length: totalPages }, (_, pageIndex) => pageIndex + 1);
	}

	if (pages === 1) return [1];

	const selected = new Set<number>();

	for (let pageIndex = 0; pageIndex < pages; pageIndex++) {
		selected.add(1 + Math.round((pageIndex * (totalPages - 1)) / (pages - 1)));
	}

	return [...selected].sort((earlierPage, laterPage) => earlierPage - laterPage);
}

interface CoveredStarsParams {
	lastFetchedPage: number;
	totalStars: number;
}

export function coveredStars({ lastFetchedPage, totalStars }: CoveredStarsParams): number {
	return Math.min(lastFetchedPage * STARGAZER_PAGE_SIZE, totalStars);
}
