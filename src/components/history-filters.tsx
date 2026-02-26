import { CalendarAddLinear } from "@solar-icons/react-perf";
import { addDays, format } from "date-fns";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverPopup, PopoverTrigger } from "@/components/ui/popover";

interface HistoryFiltersProps {
	search: string;
	onSearchChange: (value: string) => void;
	filterDate: DateRange | undefined;
	onFilterDateChange: (date: DateRange | undefined) => void;
	onClear: () => void;
}

export function HistoryFilters({
	search,
	onSearchChange,
	filterDate,
	onFilterDateChange,
	onClear,
}: HistoryFiltersProps) {
	const [filterMonth, setFilterMonth] = useState(new Date());
	const [filterOpen, setFilterOpen] = useState(false);

	return (
		<div className="flex items-center gap-2">
			<h2 className="shrink-0 font-medium text-sm">History</h2>
			<Input
				placeholder="Search…"
				size="sm"
				className="max-w-64"
				value={search}
				onChange={(e: React.ChangeEvent<HTMLInputElement>) => onSearchChange(e.target.value)}
				aria-label="Search compression history"
			/>
			<Popover open={filterOpen} onOpenChange={setFilterOpen}>
				<PopoverTrigger render={<Button variant="outline" size="sm" className="shrink-0" />}>
					<CalendarAddLinear className="size-4" aria-hidden="true" />
					{filterDate?.from
						? filterDate.to
							? `${format(filterDate.from, "MMM d")} – ${format(filterDate.to, "MMM d")}`
							: format(filterDate.from, "MMM d")
						: "Date"}
				</PopoverTrigger>
				<PopoverPopup align="end" className="z-50 w-auto p-0">
					<div className="flex max-sm:flex-col">
						<div className="relative py-1 ps-1 max-sm:order-1 max-sm:border-t">
							<div className="flex h-full flex-col sm:border-e sm:pe-3">
								{(
									[
										["Today", 0, 0],
										["Yesterday", -1, -1],
										["Last 3 days", -3, 0],
										["Last week", -7, 0],
									] as const
								).map(([label, fromOffset, toOffset]) => (
									<Button
										key={label}
										className="w-full justify-start"
										onClick={() => {
											const today = new Date();
											const from = addDays(today, fromOffset);
											const to = addDays(today, toOffset);
											onFilterDateChange({ from, to });
											setFilterMonth(from);
											setFilterOpen(false);
										}}
										size="sm"
										variant="ghost"
									>
										{label}
									</Button>
								))}
							</div>
						</div>
						<Calendar
							className="max-sm:pb-3 sm:ps-2"
							mode="range"
							month={filterMonth}
							onMonthChange={setFilterMonth}
							selected={filterDate}
							onSelect={onFilterDateChange}
							disabled={{ after: new Date() }}
						/>
					</div>
				</PopoverPopup>
			</Popover>
			<Button
				variant="ghost"
				size="sm"
				className="shrink-0 text-xs"
				disabled={!(filterDate?.from || search)}
				onClick={onClear}
			>
				Clear
			</Button>
		</div>
	);
}
