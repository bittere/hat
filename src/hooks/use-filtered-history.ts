import { useMemo } from "react";
import type { DateRange } from "react-day-picker";
import type { CompressionRecord } from "@/lib/types";

export function useFilteredHistory(history: CompressionRecord[], search: string, filterDate: DateRange | undefined) {
  const filteredHistory = useMemo(() => {
    const query = search.toLowerCase();
    
    // OPTIMIZATION 1: Parse and normalize the date range ONCE before the loop.
    // Doing this inside the filter loop creates massive overhead by instantiating 
    // new Date objects and calling setHours() for every single record in the history.
    let fromTime = 0;
    let toTime = 0;
    
    if (filterDate?.from) {
      const from = new Date(filterDate.from);
      from.setHours(0, 0, 0, 0);
      fromTime = from.getTime();
      
      const to = filterDate.to ? new Date(filterDate.to) : new Date(from);
      to.setHours(23, 59, 59, 999); // Set to the very end of the day to catch all times
      toTime = to.getTime();
    }

    return history.filter((record) => {
      if (query && !record.initial_path.toLowerCase().includes(query)) {
        return false;
      }
      
      if (filterDate?.from) {
        // Now we just do a simple integer comparison which is extremely fast
        const recordTime = record.timestamp * 1000;
        if (recordTime < fromTime || recordTime > toTime) {
          return false;
        }
      }
      
      return true;
    });
  }, [history, search, filterDate]);

  const historyGroups = useMemo(() => {
    // OPTIMIZATION 2: Pre-calculate the "Today" and "Yesterday" strings ONCE.
    // Previously, `today.toDateString()` was being evaluated for every single record.
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    
    const todayStr = today.toDateString();
    const yesterdayStr = yesterday.toDateString();

    const groups: { label: string; items: { record: CompressionRecord; index: number }[] }[] = [];
    
    // OPTIMIZATION 3: Use a reverse for-loop instead of [...filteredHistory].reverse()
    // This prevents allocating a whole new array in memory just to iterate backwards.
    for (let i = filteredHistory.length - 1; i >= 0; i--) {
      const record = filteredHistory[i];
      const date = new Date(record.timestamp * 1000);
      const dateStr = date.toDateString();
      
      const dateLabel = dateStr === todayStr 
        ? "Today" 
        : dateStr === yesterdayStr 
          ? "Yesterday" 
          : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

      const last = groups[groups.length - 1];
      if (last && last.label === dateLabel) {
        last.items.push({ record, index: i });
      } else {
        groups.push({ label: dateLabel, items: [{ record, index: i }] });
      }
    }
    
    return groups;
  }, [filteredHistory]);

  return { filteredHistory, historyGroups };
}
