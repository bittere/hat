import { BillCrossLinear, FileSendLinear } from "@solar-icons/react-perf";
import { CompressionHistoryCard } from "@/components/compression-history-card";
import { Button } from "@/components/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { CompressionRecord } from "@/lib/types";

interface HistoryListProps {
	historyGroups: {
		label: string;
		items: { record: CompressionRecord; index: number }[];
	}[];
	historyLength: number;
	filteredCount: number;
	recompressed: Set<number>;
	onRecompress: (path: string, quality: number, timestamp: number) => void;
	onConvert: (path: string, targetFormat: string, timestamp: number) => void;
	onClearFilters: () => void;
}

export function HistoryList({
	historyGroups,
	historyLength,
	filteredCount,
	recompressed,
	onRecompress,
	onConvert,
	onClearFilters,
}: HistoryListProps) {
	if (historyLength === 0) {
		return (
			<Empty>
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<FileSendLinear />
					</EmptyMedia>
					<EmptyTitle>No compressions yet</EmptyTitle>
					<EmptyDescription>Compress an image to see your history here.</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	if (filteredCount === 0) {
		return (
			<Empty>
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<BillCrossLinear />
					</EmptyMedia>
					<EmptyTitle>No results found</EmptyTitle>
					<EmptyDescription>Try a different search query.</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					<Button size="sm" variant="outline" onClick={onClearFilters}>
						Clear filters
					</Button>
				</EmptyContent>
			</Empty>
		);
	}

	return (
		<ScrollArea className="flex-1">
			<div className="flex flex-col gap-2 pr-3">
				{historyGroups.map((group, gi) => (
					<div key={group.label}>
						<p
							className={`px-1 font-medium text-muted-foreground text-xs pb-2${
								gi > 0 ? "pt-4" : ""
							}`}
						>
							{group.label}
						</p>
						<div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
							{group.items.map(({ record, index }) => {
								const cannotRecompress =
									recompressed.has(record.timestamp) || record.quality >= 100;
								return (
									<CompressionHistoryCard
										key={`${record.timestamp}-${index}`}
										record={record}
										cannotRecompress={cannotRecompress}
										onRecompress={onRecompress}
										onConvert={onConvert}
									/>
								);
							})}
						</div>
					</div>
				))}
			</div>
		</ScrollArea>
	);
}
