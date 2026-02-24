import { Card, CardHeader, CardTitle, CardDescription, CardPanel, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { CompressionRecord } from "@/lib/types";
import { formatBytes, extractFileName, extractDirectory } from "@/lib/format";
import { cn } from "@/lib/utils";

interface CompressionHistoryCardProps {
  record: CompressionRecord;
  cannotRecompress: boolean;
  onRecompress: (initialPath: string, previousQuality: number, timestamp: number) => void;
}

export function CompressionHistoryCard({ record, cannotRecompress, onRecompress }: CompressionHistoryCardProps) {
  const fileName = extractFileName(record.initial_path);
  const directory = extractDirectory(record.initial_path);
  const saved = record.initial_size - record.compressed_size;
  const pct = record.initial_size > 0 ? ((saved / record.initial_size) * 100).toFixed(1) : "0";
  const time = new Date(record.timestamp * 1000).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  return (
    <Card className={cn(
      "group transition-all",
      cannotRecompress && "opacity-60 grayscale-[0.5]"
    )}>
      <CardHeader>
        <CardTitle className="truncate" title={record.initial_path}>
          {fileName}
        </CardTitle>
        <CardDescription className="truncate" title={directory}>
          {record.initial_format} → {record.final_format} • {record.quality}% • {time}
        </CardDescription>
      </CardHeader>
      <CardPanel>
        <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
          <span>
            {formatBytes(record.initial_size)} → {formatBytes(record.compressed_size)}
          </span>
          <span className={saved > 0 ? "text-primary font-bold" : ""}>
            {saved >= 0 ? `−${pct}%` : `+${Math.abs(Number(pct))}%`}
          </span>
        </div>
      </CardPanel>
      <CardFooter>
        <Button
          variant="outline"
          size="xs"
          className="w-full h-7 text-[10px] font-medium"
          onClick={() => onRecompress(record.initial_path, record.quality, record.timestamp)}
          disabled={cannotRecompress}
        >
          Recompress
        </Button>
      </CardFooter>
    </Card>
  );
}
