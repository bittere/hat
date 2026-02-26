import { BillCrossLinear, FileSendLinear } from "@solar-icons/react-perf";
import { CompressionHistoryCard } from "@/components/compression-history-card";
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
}

export function HistoryList({
	historyGroups,
	historyLength,
	filteredCount,
	recompressed,
	onRecompress,
}: HistoryListProps) {
	if (historyLength === 0) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
				<FileSendLinear className="size-12" />
				<p className="text-sm">No compressions found.</p>
			</div>
		);
	}

	if (filteredCount === 0) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
				<BillCrossLinear className="size-12" />
				<p className="text-sm">No results found.</p>
			</div>
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
						<div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
							{group.items.map(({ record, index }) => {
								const cannotRecompress =
									record.original_deleted ||
									recompressed.has(record.timestamp) ||
									record.quality >= 100;
								return (
									<CompressionHistoryCard
										key={`${record.timestamp}-${index}`}
										record={record}
										cannotRecompress={cannotRecompress}
										onRecompress={onRecompress}
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
