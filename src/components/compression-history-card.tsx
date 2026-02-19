import { Card, CardHeader, CardTitle, CardDescription, CardPanel, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { CompressionRecord } from "@/lib/types";
import { formatBytes, extractFileName } from "@/lib/format";

interface CompressionHistoryCardProps {
  record: CompressionRecord;
  cannotRecompress: boolean;
  onRecompress: (initialPath: string, previousQuality: number, timestamp: number) => void;
}

export function CompressionHistoryCard({ record, cannotRecompress, onRecompress }: CompressionHistoryCardProps) {
  const fileName = extractFileName(record.initial_path);
  const saved = record.initial_size - record.compressed_size;
  const pct = record.initial_size > 0 ? ((saved / record.initial_size) * 100).toFixed(1) : "0";

  return (
    <Card className={`rounded-xl${cannotRecompress ? " opacity-50" : ""}`}>
      <CardHeader className="p-3 pb-1">
        <CardTitle className="text-sm font-medium truncate" title={fileName}>
          {fileName}
        </CardTitle>
        <CardDescription className="text-xs">
          {record.initial_format.toUpperCase()} → {record.final_format.toUpperCase()} · Level {record.quality}
        </CardDescription>
      </CardHeader>
      <CardPanel className="px-3 pb-1 pt-0">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {formatBytes(record.initial_size)} → {formatBytes(record.compressed_size)}
          </span>
          <span className={saved > 0 ? "text-success-foreground font-medium" : ""}>
            {saved > 0
              ? `−${pct}%`
              : saved === 0
                ? "No change"
                : `+${Math.abs(Number(pct))}%`}
          </span>
        </div>
      </CardPanel>
      <CardFooter className="px-3 pb-3 pt-1">
        <Button
          variant="outline"
          size="xs"
          className="w-full"
          onClick={() => onRecompress(record.initial_path, record.quality, record.timestamp)}
          disabled={cannotRecompress}
        >
          Recompress Harder
        </Button>
      </CardFooter>
    </Card>
  );
}
