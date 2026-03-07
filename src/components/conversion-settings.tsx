import { AddCircleLinear, TrashBinTrashLinear, Tuning2Linear } from "@solar-icons/react-perf";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { FORMAT_LABELS, type FormatKey } from "@/components/format-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import type { FormatOptions } from "@/lib/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

/** A single conversion rule: many sources → one target */
interface ConversionRule {
	id: string;
	sources: FormatKey[];
	target: FormatKey;
}

/** Derive rules from per-format convert_to settings */
function rulesFromOptions(options: FormatOptions): ConversionRule[] {
	const grouped = new Map<FormatKey, FormatKey[]>();
	for (const { key } of FORMAT_LABELS) {
		const config = options[key];
		if (config?.convert_to) {
			const convertTo = config.convert_to as FormatKey;
			const existing = grouped.get(convertTo) ?? [];
			existing.push(key);
			grouped.set(convertTo, existing);
		}
	}
	return Array.from(grouped.entries()).map(([target, sources]) => ({
		id: crypto.randomUUID(),
		sources,
		target,
	}));
}

/** Apply rules back into per-format convert_to settings */
function applyRulesToOptions(rules: ConversionRule[], options: FormatOptions): FormatOptions {
	const updated = structuredClone(options);
	for (const { key } of FORMAT_LABELS) {
		if (updated[key]) {
			updated[key].convert_to = null;
		}
	}
	for (const rule of rules) {
		for (const source of rule.sources) {
			if (updated[source]) {
				updated[source].convert_to = rule.target;
			}
		}
	}
	return updated;
}

/** Get all source formats that are already used in other rules */
function getUsedSources(rules: ConversionRule[], excludeRuleId?: string): Set<FormatKey> {
	const used = new Set<FormatKey>();
	for (const rule of rules) {
		if (rule.id !== excludeRuleId) {
			for (const s of rule.sources) used.add(s);
		}
	}
	return used;
}

function getFormatLabel(key: FormatKey): string {
	return FORMAT_LABELS.find((f) => f.key === key)?.label ?? key;
}

// ---------------------------------------------------------------------------
// ConversionSettings — main component
// ---------------------------------------------------------------------------

export function ConversionSettings() {
	const [formatOptions, setFormatOptions] = useState<FormatOptions | null>(null);
	const [rules, setRules] = useState<ConversionRule[]>([]);
	const saveTimer = useRef<ReturnType<typeof setTimeout>>(null);

	useEffect(() => {
		invoke<FormatOptions>("get_format_options").then((opts) => {
			setFormatOptions(opts);
			setRules(rulesFromOptions(opts));
		});
	}, []);

	const persistRules = useCallback(
		(newRules: ConversionRule[]) => {
			if (!formatOptions) return;
			const updated = applyRulesToOptions(newRules, formatOptions);
			setFormatOptions(updated);
			if (saveTimer.current) clearTimeout(saveTimer.current);
			saveTimer.current = setTimeout(() => {
				invoke("set_format_options", { options: updated });
			}, 300);
		},
		[formatOptions]
	);

	const updateRules = useCallback(
		(updater: (prev: ConversionRule[]) => ConversionRule[]) => {
			setRules((prev) => {
				const next = updater(prev);
				persistRules(next);
				return next;
			});
		},
		[persistRules]
	);

	const addRule = () => {
		const usedSources = getUsedSources(rules);
		const available = FORMAT_LABELS.map((f) => f.key).filter((k) => !usedSources.has(k));
		if (available.length < 2) return;

		const source = available[0];
		const target = available.find((k) => k !== source) ?? available[1];

		updateRules((prev) => [
			...prev,
			{
				id: crypto.randomUUID(),
				sources: [source],
				target,
			},
		]);
	};

	const removeRule = (id: string) => {
		updateRules((prev) => prev.filter((r) => r.id !== id));
	};

	const addSourceToRule = (ruleId: string, key: FormatKey | null) => {
		if (!key) return;
		updateRules((prev) =>
			prev.map((r) =>
				r.id === ruleId && !r.sources.includes(key) ? { ...r, sources: [...r.sources, key] } : r
			)
		);
	};

	const removeSourceFromRule = (ruleId: string, key: FormatKey) => {
		updateRules(
			(prev) =>
				prev
					.map((r) => {
						if (r.id !== ruleId) return r;
						const next = r.sources.filter((s) => s !== key);
						return next.length > 0 ? { ...r, sources: next } : null;
					})
					.filter(Boolean) as ConversionRule[]
		);
	};

	const changeTarget = (ruleId: string, target: FormatKey) => {
		updateRules((prev) =>
			prev.map((r) => {
				if (r.id !== ruleId) return r;
				const filteredSources = r.sources.filter((s) => s !== target);
				return {
					...r,
					target,
					sources: filteredSources.length > 0 ? filteredSources : r.sources,
				};
			})
		);
	};

	if (!formatOptions) return null;

	return (
		<div className="flex flex-col p-2">
			<div className="flex items-center justify-between">
				<span className="font-medium text-muted-foreground">Conversion Rules</span>
				<Button variant="outline" size="sm" onClick={addRule}>
					Add Rule
				</Button>
			</div>
			{rules.length === 0 ? (
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Tuning2Linear />
						</EmptyMedia>
						<EmptyTitle>No rules set up</EmptyTitle>
						<EmptyDescription>
							Add a rule to automatically convert files from one format to another.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button size="sm" onClick={addRule}>
							Add Rule
						</Button>
					</EmptyContent>
				</Empty>
			) : (
				<div className="flex flex-col gap-y-4 px-6 pt-4">
					<div className="flex items-center gap-x-4">
						<span className="flex-1 text-muted-foreground text-xs">When file is</span>
						<span className="w-32 text-right text-muted-foreground text-xs">Convert to</span>
						<span className="w-8" />
					</div>

					{rules.map((rule) => (
						<div key={rule.id} className="flex items-center gap-x-4">
							<div className="flex flex-1 flex-wrap items-center gap-2">
								{rule.sources.map((source) => (
									<Badge key={source} variant="info" size="lg" className="group/badge pr-1">
										{getFormatLabel(source)}
										<button
											type="button"
											onClick={() => removeSourceFromRule(rule.id, source)}
											className="ml-1 rounded-full p-0.5 transition-colors hover:bg-foreground/10"
										>
											<TrashBinTrashLinear className="size-3" />
										</button>
									</Badge>
								))}
								{(() => {
									const usedSources = getUsedSources(rules);
									const available = FORMAT_LABELS.filter(
										(f) => !usedSources.has(f.key) && f.key !== rule.target
									);
									if (available.length === 0) return null;

									return (
										<Select onValueChange={(val) => addSourceToRule(rule.id, val as FormatKey)}>
											<SelectTrigger size="sm" className="w-auto gap-2 border-dashed px-2">
												<AddCircleLinear className="size-3.5 opacity-50" />
												<SelectValue placeholder="Add Format" />
											</SelectTrigger>
											<SelectContent>
												{available.map((f) => (
													<SelectItem key={f.key} value={f.key}>
														{f.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									);
								})()}
							</div>

							<div className="flex w-32 justify-end">
								{(() => {
									const usedSources = getUsedSources(rules);
									// Exclude formats that are currently being used as sources in *any* rule,
									// as well as the sources explicitly specified for *this* rule.
									const availableTargets = FORMAT_LABELS.filter(
										(f) =>
											(!usedSources.has(f.key) && !rule.sources.includes(f.key)) ||
											f.key === rule.target
									);

									return (
										<Select
											value={rule.target}
											onValueChange={(val) => changeTarget(rule.id, val as FormatKey)}
										>
											<SelectTrigger size="sm">{getFormatLabel(rule.target)}</SelectTrigger>
											<SelectContent>
												{availableTargets.map((f) => (
													<SelectItem key={f.key} value={f.key}>
														{f.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									);
								})()}
							</div>

							<Button onClick={() => removeRule(rule.id)} variant="ghost" size="icon">
								<TrashBinTrashLinear className="size-4 transition-transform group-hover:scale-110" />
							</Button>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
