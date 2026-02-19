import { Card, CardHeader, CardTitle, CardPanel } from "@/components/ui/card";
import type { CompressionRecord } from "@/lib/types";
import { formatBytes } from "@/lib/format";

interface StatisticsCardProps {
  history: CompressionRecord[];
}

export function StatisticsCard({ history }: StatisticsCardProps) {
  const totalSaved = history.reduce((sum, r) => sum + Math.max(0, r.initial_size - r.compressed_size), 0);
  const totalOriginal = history.reduce((sum, r) => sum + r.initial_size, 0);
  const totalCompressed = history.reduce((sum, r) => sum + r.compressed_size, 0);
  const avgReduction = history.length > 0 ? ((totalSaved / totalOriginal) * 100).toFixed(1) : "0";

  return (
    <Card className="rounded-xl mt-1">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm font-medium">Overall Statistics</CardTitle>
      </CardHeader>
      <CardPanel className="px-4 pb-4 pt-0">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Files Processed</p>
            <p className="font-semibold tabular-nums">{history.length}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Total Saved</p>
            <p className="font-semibold tabular-nums">{formatBytes(totalSaved)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Original Size</p>
            <p className="font-semibold tabular-nums">{formatBytes(totalOriginal)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Compressed Size</p>
            <p className="font-semibold tabular-nums">{formatBytes(totalCompressed)}</p>
          </div>
          <div className="col-span-2">
            <p className="text-muted-foreground text-xs">Avg. Reduction</p>
            <p className="font-semibold tabular-nums">{avgReduction}%</p>
          </div>
        </div>
      </CardPanel>
    </Card>
  );
}
