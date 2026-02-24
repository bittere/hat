import { useMemo } from "react";
import type { DateRange } from "react-day-picker";
import type { CompressionRecord } from "@/lib/types";

export function useFilteredHistory(history: CompressionRecord[], search: string, filterDate: DateRange | undefined) {
  const filteredHistory = useMemo(() => {
    const query = search.toLowerCase();
    return history.filter((record) => {
      if (query && !record.initial_path.toLowerCase().includes(query)) {
        return false;
      }
      if (filterDate?.from) {
        const recordDate = new Date(record.timestamp * 1000);
        recordDate.setHours(0, 0, 0, 0);
        const from = new Date(filterDate.from);
        from.setHours(0, 0, 0, 0);
        const to = filterDate.to ? new Date(filterDate.to) : from;
        to.setHours(0, 0, 0, 0);
        if (recordDate < from || recordDate > to) {
          return false;
        }
      }
      return true;
    });
  }, [history, search, filterDate]);

  const historyGroups = useMemo(() => {
    const reversed = [...filteredHistory].reverse();
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const groups: { label: string; items: { record: CompressionRecord; index: number }[] }[] = [];
    reversed.forEach((record, i) => {
      const date = new Date(record.timestamp * 1000);
      const isToday = date.toDateString() === today.toDateString();
      const isYesterday = date.toDateString() === yesterday.toDateString();
      const dateLabel = isToday
        ? "Today"
        : isYesterday
          ? "Yesterday"
          : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

      const last = groups[groups.length - 1];
      if (last && last.label === dateLabel) {
        last.items.push({ record, index: i });
      } else {
        groups.push({ label: dateLabel, items: [{ record, index: i }] });
      }
    });
    return groups;
  }, [filteredHistory]);

  return { filteredHistory, historyGroups };
}
