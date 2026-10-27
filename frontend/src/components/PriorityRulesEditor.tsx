import { Plus, Trash2 } from "lucide-react";
import type { PriorityRule } from "../types";
import { PRIORITY_LABELS } from "../lib/format";

const MATCH_FIELDS: PriorityRule["match"][] = ["dst_port", "src_port", "port", "protocol", "classification", "any"];

export default function PriorityRulesEditor({
  rules,
  onChange,
}: {
  rules: PriorityRule[];
  onChange: (rules: PriorityRule[]) => void;
}) {
  const update = (index: number, patch: Partial<PriorityRule>) => {
    onChange(rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
  };

  const remove = (index: number) => {
    onChange(rules.filter((_, i) => i !== index));
  };

  const add = () => {
    onChange([...rules, { match: "dst_port", value: "", priority: 3, label: "", enabled: true }]);
  };

  const loadDefaults = () => {
    onChange([
      { match: "protocol", value: "ICMP", priority: 2, label: "ICMP control", enabled: true },
      { match: "protocol", value: "ICMPv6", priority: 2, label: "ICMPv6 control", enabled: true },
      { match: "dst_port", value: "53", priority: 1, label: "DNS", enabled: true },
      { match: "dst_port", value: "67", priority: 1, label: "DHCP", enabled: true },
      { match: "dst_port", value: "123", priority: 2, label: "NTP", enabled: true },
      { match: "dst_port", value: "22", priority: 2, label: "SSH", enabled: true },
      { match: "dst_port", value: "443", priority: 3, label: "HTTPS", enabled: true },
    ]);
  };

  return (
    <div className="space-y-2">
      <div className="hidden grid-cols-[1fr_1fr_1fr_1fr_auto_auto] gap-2 text-[11px] uppercase tracking-wide text-slate-500 lg:grid">
        <span>Match field</span>
        <span>Value</span>
        <span>Priority</span>
        <span>Label</span>
        <span>On</span>
        <span />
      </div>
      {rules.map((rule, index) => (
        <div key={index} className="grid grid-cols-2 gap-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto_auto]">
          <select className="input !py-1" value={rule.match} onChange={(event) => update(index, { match: event.target.value as PriorityRule["match"] })}>
            {MATCH_FIELDS.map((field) => (
              <option key={field} value={field}>
                {field}
              </option>
            ))}
          </select>
          <input
            className="input !py-1"
            placeholder={rule.match.includes("port") ? "443" : "protocol name"}
            value={rule.value}
            onChange={(event) => update(index, { value: event.target.value })}
          />
          <select className="input !py-1" value={rule.priority} onChange={(event) => update(index, { priority: Number(event.target.value) })}>
            {[1, 2, 3, 4].map((priority) => (
              <option key={priority} value={priority}>
                {priority} · {PRIORITY_LABELS[priority]}
              </option>
            ))}
          </select>
          <input
            className="input !py-1"
            placeholder="label"
            value={rule.label}
            onChange={(event) => update(index, { label: event.target.value })}
          />
          <label className="flex items-center justify-center gap-1 text-xs text-slate-400">
            <input type="checkbox" checked={rule.enabled} onChange={(event) => update(index, { enabled: event.target.checked })} />
          </label>
          <button type="button" className="btn-ghost !px-2" onClick={() => remove(index)} title="Remove rule">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2 pt-1">
        <button type="button" className="btn-ghost" onClick={add}>
          <Plus size={14} /> Add rule
        </button>
        <button type="button" className="btn-ghost" onClick={loadDefaults}>
          Load suggested rules
        </button>
      </div>
      <p className="text-xs text-slate-500">
        Rules are simulated classifications for the router simulator. Captured traffic has no real QoS marking, so these
        priorities are labelled as inferred, not observed.
      </p>
    </div>
  );
}
