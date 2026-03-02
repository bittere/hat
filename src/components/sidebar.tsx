import { MagnifierLinear } from "@solar-icons/react-perf";
import { useMemo, useState } from "react";
import { SidebarHistory } from "@/components/sidebar-history";
import type { CompressionRecord } from "@/lib/types";

interface SidebarProps {
	open: boolean;
	history: CompressionRecord[];
}

export function Sidebar({ open, history }: SidebarProps) {
	const [search, setSearch] = useState("");

	const filteredHistory = useMemo(() => {
		if (!search) return history;
		const query = search.toLowerCase();
		return history.filter((record) => record.initial_path.toLowerCase().includes(query));
	}, [history, search]);

	return (
		<aside
			className={`h-full shrink-0 overflow-hidden border-border border-r bg-background transition-[width] duration-300 ease-in-out ${open ? "w-64" : "w-0 border-r-0"}`}
		>
			<div className="flex h-full w-64 flex-col p-4">
				<div className="flex h-12 items-center pl-12">
					<h2 className="font-semibold text-base text-foreground">History</h2>
				</div>
				<div className="relative mt-4">
					<MagnifierLinear className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
					<input
						type="text"
						placeholder="Search files…"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="h-8 w-full rounded-md border border-border bg-transparent pr-3 pl-8 text-foreground text-xs placeholder:text-muted-foreground focus:border-primary focus:outline-none"
					/>
				</div>
				<div className="mt-3 flex min-h-0 flex-1 flex-col">
					<SidebarHistory history={filteredHistory} />
				</div>
			</div>
		</aside>
	);
}
