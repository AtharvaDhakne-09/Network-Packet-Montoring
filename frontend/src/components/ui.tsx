import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2 } from "lucide-react";
import { captureStateStyle } from "../lib/captureState";
import type { CaptureState } from "../types";

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = "",
  bodyClassName = "card-body",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-header">
          <div>
            {title && <h2 className="text-sm font-semibold text-slate-100">{title}</h2>}
            {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function MetricCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "default" | "accent" | "success" | "warning" | "danger";
}) {
  const toneClass = {
    default: "text-slate-100",
    accent: "text-accent",
    success: "text-emerald-400",
    warning: "text-amber-400",
    danger: "text-rose-400",
  }[tone];
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
          <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
          {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
        </div>
        {icon && <div className="rounded-lg bg-surface-800 p-2 text-slate-300">{icon}</div>}
      </div>
    </div>
  );
}

export function StatusPill({ state, label }: { state: CaptureState; label?: string }) {
  const style = captureStateStyle(state);
  const toneClasses: Record<string, string> = {
    live: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
    idle: "bg-slate-500/15 text-slate-300 border border-slate-500/30",
    warn: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
    error: "bg-rose-500/15 text-rose-300 border border-rose-500/30",
    muted: "bg-slate-600/15 text-slate-300 border border-slate-600/30",
  };
  return (
    <span className={`badge ${toneClasses[style.tone]}`}>
      <span
        className={`h-2 w-2 rounded-full ${
          style.tone === "live" ? "animate-pulse bg-emerald-400" : "bg-current"
        }`}
      />
      {label ?? style.label}
    </span>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
  onClose,
}: {
  tone?: "info" | "warning" | "error" | "success";
  title?: string;
  children?: ReactNode;
  onClose?: () => void;
}) {
  const config = {
    info: { classes: "border-sky-500/40 bg-sky-500/10 text-sky-200", icon: <Info size={16} /> },
    warning: { classes: "border-amber-500/40 bg-amber-500/10 text-amber-200", icon: <AlertTriangle size={16} /> },
    error: { classes: "border-rose-500/40 bg-rose-500/10 text-rose-200", icon: <AlertTriangle size={16} /> },
    success: { classes: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200", icon: <CheckCircle2 size={16} /> },
  }[tone];
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${config.classes}`}>
      <span className="mt-0.5">{config.icon}</span>
      <div className="flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className="text-xs opacity-90">{children}</div>}
      </div>
      {onClose && (
        <button type="button" onClick={onClose} className="text-xs opacity-70 hover:opacity-100">
          dismiss
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-surface-600 bg-surface-900/40 px-6 py-12 text-center">
      {icon && <div className="text-slate-500">{icon}</div>}
      <div>
        <p className="text-sm font-medium text-slate-200">{title}</p>
        {description && <p className="mt-1 max-w-md text-xs text-slate-400">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-400">
      <Loader2 size={14} className="animate-spin" />
      {label}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
      {children}
      {error ? <span className="block text-xs text-rose-400">{error}</span> : hint ? <span className="block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex items-center gap-2 text-xs ${disabled ? "opacity-50" : ""}`}
    >
      <span
        className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${
          checked ? "bg-accent/80" : "bg-surface-600"
        }`}
      >
        <span
          className={`absolute h-3 w-3 rounded-full bg-white transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </span>
      <span className="text-slate-300">{label}</span>
    </button>
  );
}
