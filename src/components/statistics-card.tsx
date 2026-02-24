import { Card, CardHeader, CardTitle, CardPanel } from "@/components/ui/card";
import type { CompressionRecord } from "@/lib/types";
import { formatBytes } from "@/lib/format";

interface StatisticsCardProps {
  history: CompressionRecord[];
}

export function StatisticsCard({ history }: StatisticsCardProps) {
  const totalSaved = history.reduce((sum, r) => sum + Math.max(0, r.initial_size - r.compressed_size), 0);
  const totalOriginal = history.reduce((sum, r) => sum + r.initial_size, 0);
  const avgReduction = history.length > 0 ? ((totalSaved / totalOriginal) * 100).toFixed(1) : "0";

  return (
    <Card className="mt-1">
      <CardHeader>
        <CardTitle>Overall Statistics</CardTitle>
      </CardHeader>
      <CardPanel>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-muted-foreground font-medium">Files Processed</p>
            <p className="font-semibold tabular-nums text-sm">{history.length}</p>
          </div>
          <div>
            <p className="text-muted-foreground font-medium">Total Saved</p>
            <p className="font-semibold tabular-nums text-sm text-primary">{formatBytes(totalSaved)}</p>
          </div>
          <div>
            <p className="text-muted-foreground font-medium">Original Size</p>
            <p className="font-semibold tabular-nums text-sm">{formatBytes(totalOriginal)}</p>
          </div>
          <div>
            <p className="text-muted-foreground font-medium">Reduction</p>
            <p className="font-semibold tabular-nums text-sm">{avgReduction}%</p>
          </div>
        </div>
      </CardPanel>
    </Card>
  );
}
