import { Card, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
import { formatBytes } from "@/lib/format";
import type { CompressionRecord } from "@/lib/types";

interface StatisticsCardProps {
	history: CompressionRecord[];
}

export function StatisticsCard({ history }: StatisticsCardProps) {
	const completedHistory = history.filter((r) => r.status !== "processing");
	const totalSaved = completedHistory.reduce(
		(sum, r) => sum + Math.max(0, r.initial_size - r.compressed_size),
		0
	);
	const totalOriginal = completedHistory.reduce((sum, r) => sum + r.initial_size, 0);
	const avgReduction =
		completedHistory.length > 0 ? ((totalSaved / totalOriginal) * 100).toFixed(1) : "0";

	return (
		<Card className="mt-1">
			<CardHeader>
				<CardTitle>Overall Statistics</CardTitle>
			</CardHeader>
			<CardPanel>
				<div className="grid grid-cols-2 gap-3 text-xs">
					<div>
						<p className="font-medium text-muted-foreground">Files Processed</p>
						<p className="font-semibold text-sm tabular-nums">{completedHistory.length}</p>
					</div>
					<div>
						<p className="font-medium text-muted-foreground">Total Saved</p>
						<p className="font-semibold text-primary text-sm tabular-nums">
							{formatBytes(totalSaved)}
						</p>
					</div>
					<div>
						<p className="font-medium text-muted-foreground">Original Size</p>
						<p className="font-semibold text-sm tabular-nums">{formatBytes(totalOriginal)}</p>
					</div>
					<div>
						<p className="font-medium text-muted-foreground">Reduction</p>
						<p className="font-semibold text-sm tabular-nums">{avgReduction}%</p>
					</div>
				</div>
			</CardPanel>
		</Card>
	);
}
