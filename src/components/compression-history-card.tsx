import { ArrowDownLinear, ArrowUpLinear } from "@solar-icons/react-perf";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardAction,
	CardDescription,
	CardFooter,
	CardHeader,
	CardPanel,
	CardTitle,
} from "@/components/ui/card";
import { Group, GroupSeparator } from "@/components/ui/group";
import { Spinner } from "@/components/ui/spinner";
import { extractFileName, formatBytes } from "@/lib/format";
import type { CompressionRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

interface CompressionHistoryCardProps {
	record: CompressionRecord;
	cannotRecompress: boolean;
	onRecompress: (initialPath: string, previousQuality: number, timestamp: number) => void;
	onConvert: (initialPath: string, targetFormat: string, timestamp: number) => void;
}

export function CompressionHistoryCard({
	record,
	cannotRecompress,
	onRecompress,
	onConvert,
}: CompressionHistoryCardProps) {
	const fileName = extractFileName(record.initial_path);
	const isProcessing = record.status === "processing";
	const isFailed = record.status === "failed";

	const saved = record.initial_size - record.compressed_size;
	const pct = record.initial_size > 0 ? ((saved / record.initial_size) * 100).toFixed(1) : "0";
	const time = new Date(record.timestamp * 1000).toLocaleTimeString(undefined, {
		hour: "numeric",
		minute: "2-digit",
	});

	const [fileExists, setFileExists] = useState(true);

	useEffect(() => {
		if (!record.initial_path || isProcessing) return;
		invoke<boolean>("check_file_exists", { path: record.initial_path }).then((exists) =>
			setFileExists(exists)
		);
	}, [record.initial_path, isProcessing]);

	const targetFormat = record.final_format === "png" ? "jpeg" : "png";
	const disabled = cannotRecompress || isProcessing || !fileExists;

	return (
		<Card
			className={cn(
				"group transition-all",
				(disabled || isFailed) && "opacity-60 grayscale-[0.5]",
				isProcessing && "animate-pulse"
			)}
		>
			<CardHeader>
				<CardTitle
					className={cn("truncate text-sm", isFailed && "text-destructive")}
					title={record.initial_path}
				>
					{fileName}
				</CardTitle>
				{isProcessing && (
					<CardAction>
						<Spinner className="size-3" />
					</CardAction>
				)}
				<CardDescription className="truncate text-xs">
					{isProcessing
						? "Processing..."
						: isFailed
							? "Compression failed"
							: `${record.initial_format} → ${record.final_format} • ${record.quality}% • ${time}`}
				</CardDescription>
			</CardHeader>
			<CardPanel>
				<div className="flex items-center justify-between font-medium text-muted-foreground text-xs">
					{isProcessing ? (
						<span>Starting...</span>
					) : isFailed ? (
						<span className="text-destructive">An error occurred</span>
					) : (
						<>
							<span>
								{formatBytes(record.initial_size)} → {formatBytes(record.compressed_size)}
							</span>
							<span
								className={cn("flex items-center gap-0.5", saved > 0 && "font-bold text-primary")}
							>
								{saved >= 0 ? (
									<>
										<ArrowDownLinear className="size-3" />
										{pct}%
									</>
								) : (
									<>
										<ArrowUpLinear className="size-3" />
										{Math.abs(Number(pct))}%
									</>
								)}
							</span>
						</>
					)}
				</div>
			</CardPanel>
			<CardFooter>
				<Group aria-label="Compression actions" className="w-full">
					<Button
						variant={isFailed ? "destructive-outline" : "outline"}
						size="xs"
						className="h-7 flex-1 font-medium text-xs"
						onClick={() => onRecompress(record.initial_path, record.quality, record.timestamp)}
						disabled={disabled}
					>
						{isProcessing ? "Processing" : isFailed ? "Retry" : "Recompress"}
					</Button>
					<GroupSeparator />
					<Button
						variant="outline"
						size="xs"
						className="h-7 flex-1 font-medium text-xs"
						onClick={() => onConvert(record.initial_path, targetFormat, record.timestamp)}
						disabled={disabled || isFailed}
					>
						To {targetFormat.toUpperCase()}
					</Button>
				</Group>
			</CardFooter>
		</Card>
	);
}
