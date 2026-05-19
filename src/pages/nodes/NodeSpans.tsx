import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { Link, useParams } from "react-router-dom";
import { getToken, SKYCABLE_API } from "../../lib/auth";
import { cacheGet, cacheSet } from "../../lib/cache";
import { idFromSlug } from "../../lib/utils";

type SpanStatus = "pending" | "in_progress" | "completed" | "cancelled";

type SpanSummary = {
  expected_node?: number | null;
  expected_amplifier?: number | null;
  expected_extender?: number | null;
  expected_tsc?: number | null;
  expected_powersupply?: number | null;
  expected_ps_housing?: number | null;
  expected_cable?: number | null;
  actual_cable?: number | null;
  actual_node?: number | null;
  actual_amplifier?: number | null;
  actual_extender?: number | null;
  actual_tsc?: number | null;
};

type Span = {
  id: number;
  span_code?: string;
  strand_length?: number | null;
  number_of_runs?: number | null;
  actual_cable?: number | null;
  status: SpanStatus;
  summary?: SpanSummary | null;
  from_pole?: {
    id: number;
    sequence: number;
    pole?: { id: number; pole_code: string };
  };
  to_pole?: {
    id: number;
    sequence: number;
    pole?: { id: number; pole_code: string };
  };
};

type PoleOption = {
  id: number;
  sequence: number;
  pole?: {
    id: number;
    pole_code: string;
    lat?: string | null;
    lng?: string | null;
    skycable_status?: string;
  };
};
type NodeInfo = {
  id: number;
  name: string;
  full_label?: string;
  area?: { id: number; name: string };
};

type SpanForm = {
  from_pole_id: number | "";
  to_pole_id: number | "";
  strand_length: string;
  number_of_runs: string;
  nodes_count: string;
  amplifier: string;
  extender: string;
  tsc: string;
  power_supply: string;
  power_supply_case: string;
};

type EditForm = SpanForm & { status: SpanStatus | "" };

const emptyForm = (): SpanForm => ({
  from_pole_id: "",
  to_pole_id: "",
  strand_length: "",
  number_of_runs: "",
  nodes_count: "",
  amplifier: "",
  extender: "",
  tsc: "",
  power_supply: "",
  power_supply_case: "",
});
const emptyEdit = (): EditForm => ({ ...emptyForm(), status: "" });

const generateSpanCode = () =>
  `SP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

const computeActual = (strand: string, runs: string) => {
  const s = parseFloat(strand),
    r = parseFloat(runs);
  return !isNaN(s) && !isNaN(r) && s > 0 && r > 0 ? (s * r).toFixed(2) : "";
};

const statusCfg: Record<
  SpanStatus,
  { label: string; dot: string; badge: string }
> = {
  pending: {
    label: "Pending",
    dot: "bg-amber-400",
    badge: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  },
  in_progress: {
    label: "Ongoing",
    dot: "bg-violet-500",
    badge: "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
  },
  completed: {
    label: "Completed",
    dot: "bg-emerald-500",
    badge: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  },
  cancelled: {
    label: "Cancelled",
    dot: "bg-slate-400",
    badge: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  },
};

const iCls =
  "h-10 w-full rounded-2xl border border-slate-200 bg-white px-3.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/15 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white";
const iReadCls =
  "h-10 w-full rounded-2xl border border-emerald-200 bg-emerald-50 px-3.5 text-sm font-bold text-emerald-700 outline-none dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400";
const lCls =
  "mb-1.5 block text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400 dark:text-zinc-500";
const primaryBtn =
  "h-10 rounded-2xl bg-emerald-600 px-5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-50";
const secondaryBtn =
  "h-10 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700";
const dangerBtn =
  "h-10 rounded-2xl bg-red-600 px-5 text-sm font-semibold text-white transition hover:bg-red-700 active:scale-[0.99]";

function authHeaders() {
  return {
    Authorization: `Bearer ${getToken()}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "1",
  };
}

function getComp(span: Span, type: string): number | null {
  const map: Record<string, keyof SpanSummary> = {
    node: "expected_node",
    amplifier: "expected_amplifier",
    extender: "expected_extender",
    tsc: "expected_tsc",
    powersupply: "expected_powersupply",
    powersupply_case: "expected_ps_housing",
  };
  const key = map[type];
  return key
    ? ((span.summary?.[key] as number | null | undefined) ?? null)
    : null;
}

/* ── Modal ─────────────────────────────────────────────────────── */
function Modal({
  open,
  title,
  subtitle,
  icon,
  children,
  onClose,
  widthClass = "max-w-lg",
  danger = false,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  icon?: string;
  children: ReactNode;
  onClose: () => void;
  widthClass?: string;
  danger?: boolean;
}) {
  if (!open) return null;
  const headerColor = danger
    ? "from-red-800 to-red-600"
    : "from-slate-900 to-slate-800 dark:from-zinc-950 dark:to-zinc-900 border-b border-slate-100 dark:border-zinc-800";

  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div
        className={`relative flex max-h-[90vh] w-full ${widthClass} flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl dark:bg-zinc-950`}
      >
        {/* Header */}
        <div className={`shrink-0 bg-gradient-to-r ${headerColor} px-6 py-5`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {icon && (
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
                  <i className={`${icon} text-lg text-white`} />
                </div>
              )}
              <div>
                <p className="text-sm font-black text-white">{title}</p>
                {subtitle && (
                  <p className="mt-0.5 text-xs text-white/70">{subtitle}</p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/15 text-white transition hover:bg-white/25"
            >
              <i className="bx bx-x text-lg" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto p-6 text-slate-800 dark:text-zinc-200">
          {children}
        </div>
      </div>
    </div>
  );
}

/* ── Span Form Fields ───────────────────────────────────────────── */
function SpanFields({
  form,
  onChange,
  actualCable,
}: {
  form: Omit<SpanForm, "from_pole_id" | "to_pole_id">;
  onChange: (
    f: keyof Omit<SpanForm, "from_pole_id" | "to_pole_id">,
    v: string,
  ) => void;
  actualCable: string;
}) {
  const nf = (label: string, field: keyof typeof form, ph = "0") => (
    <div>
      <label className={lCls}>{label}</label>
      <input
        type="number"
        min="0"
        step="any"
        value={form[field]}
        onChange={(e) => onChange(field, e.target.value)}
        placeholder={ph}
        className={iCls}
      />
    </div>
  );
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-300">
          Cable Measurement
        </p>
        <div className="grid grid-cols-3 gap-3">
          {nf("Strand Length (m)", "strand_length", "e.g. 100")}
          {nf("No. of Runs", "number_of_runs", "e.g. 2")}
          <div>
            <label className={lCls}>
              Actual Cable{" "}
              <span className="normal-case font-normal text-emerald-400">
                auto
              </span>
            </label>
            <input
              readOnly
              value={actualCable}
              placeholder="0.00"
              className={iReadCls}
            />
          </div>
        </div>
      </div>
      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-300">
          Collectable Components
        </p>
        <div className="grid grid-cols-3 gap-3">
          {nf("Nodes", "nodes_count")}
          {nf("Amplifier", "amplifier")}
          {nf("Extender", "extender")}
          {nf("TSC", "tsc")}
          {nf("Power Supply", "power_supply")}
          {nf("PS Case", "power_supply_case")}
        </div>
      </div>
    </div>
  );
}

/* ── Span Pair Mini-Map ─────────────────────────────────────────── */
function SpanMiniMap({
  fromPole,
  toPole,
}: {
  fromPole: PoleOption | null;
  toPole: PoleOption | null;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;
    if (mapObj.current) {
      mapObj.current.remove();
      mapObj.current = null;
    }

    const fLat = fromPole?.pole?.lat ? Number(fromPole.pole.lat) : null;
    const fLng = fromPole?.pole?.lng ? Number(fromPole.pole.lng) : null;
    const tLat = toPole?.pole?.lat ? Number(toPole.pole.lat) : null;
    const tLng = toPole?.pole?.lng ? Number(toPole.pole.lng) : null;

    const hasFrom = fLat !== null && fLng !== null;
    const hasTo = tLat !== null && tLng !== null;
    if (!hasFrom && !hasTo) return;

    const cLat = hasFrom && hasTo ? (fLat! + tLat!) / 2 : (fLat ?? tLat)!;
    const cLng = hasFrom && hasTo ? (fLng! + tLng!) / 2 : (fLng ?? tLng)!;

    const map = L.map(mapRef.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: true,
      scrollWheelZoom: true,
    }).setView([cLat, cLng], 17);
    mapObj.current = map;

    L.tileLayer("https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", { maxZoom: 22 }).addTo(map);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png", { maxZoom: 22, opacity: 0.85, subdomains: "abcd" }).addTo(map);

    const mkIcon = (color: string, label: string) =>
      L.divIcon({
        className: "",
        html: `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
               <div style="width:22px;height:22px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 4px 10px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;">
                 <div style="width:6px;height:6px;border-radius:50%;background:#fff;"></div>
               </div>
               <div style="background:${color};color:#fff;font-size:9px;font-weight:900;padding:1px 5px;border-radius:4px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.3);">${label}</div>
             </div>`,
        iconSize: [70, 40],
        iconAnchor: [35, 11],
      });

    if (hasFrom)
      L.marker([fLat!, fLng!], {
        icon: mkIcon("#2563eb", fromPole!.pole?.pole_code ?? "FROM"),
      }).addTo(map);
    if (hasTo)
      L.marker([tLat!, tLng!], {
        icon: mkIcon("#f97316", toPole!.pole?.pole_code ?? "TO"),
      }).addTo(map);

    if (hasFrom && hasTo) {
      L.polyline(
        [
          [fLat!, fLng!],
          [tLat!, tLng!],
        ],
        { color: "#38bdf8", weight: 5, dashArray: "10 6", opacity: 0.95 },
      ).addTo(map);
    }

    setTimeout(() => {
      map.invalidateSize();
      if (hasFrom && hasTo) {
        map.fitBounds(
          [
            [fLat!, fLng!],
            [tLat!, tLng!],
          ],
          { padding: [36, 36], maxZoom: 19 },
        );
      }
    }, 120);

    return () => {
      if (mapObj.current) {
        mapObj.current.remove();
        mapObj.current = null;
      }
    };
  }, [fromPole?.id, toPole?.id]);

  const fLat = fromPole?.pole?.lat,
    tLat = toPole?.pole?.lat;
  if (!fLat && !tLat) {
    return (
      <div className="flex h-28 items-center justify-center gap-2 rounded-2xl bg-slate-50 text-xs text-slate-400 dark:bg-zinc-800">
        <i className="bx bx-map-alt text-lg" />
        No GPS coordinates on selected poles
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-2xl border border-slate-200 dark:border-zinc-700"
      style={{ height: 180 }}
    >
      <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

/* ── Declare Span Modal (centered) ──────────────────────────────── */
function BottomSheet({
  open,
  fromPole,
  toPole,
  form,
  onChange,
  onSubmit,
  onClose,
  saving,
  error,
}: {
  open: boolean;
  fromPole: PoleOption | null;
  toPole: PoleOption | null;
  form: Omit<SpanForm, "from_pole_id" | "to_pole_id">;
  onChange: (
    f: keyof Omit<SpanForm, "from_pole_id" | "to_pole_id">,
    v: string,
  ) => void;
  onSubmit: (e: SyntheticEvent<HTMLFormElement>) => void;
  onClose: () => void;
  saving: boolean;
  error: string | null;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[998] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-2xl overflow-hidden rounded-[28px] bg-white shadow-2xl dark:bg-zinc-900"
        style={{ maxHeight: "90vh", display: "flex", flexDirection: "column" }}
      >
        {/* Header */}
        <div className="shrink-0 bg-green-600 from-slate-900 to-slate-800 px-6 py-4 dark:from-zinc-950 dark:to-zinc-900">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/20">
                <i className="bx bx-git-branch text-sky-400 text-lg" />
              </div>
              <div>
                <p className="text-sm font-black text-white">Declare Span</p>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] font-semibold">
                  <span className="rounded-md bg-blue-900/25 px-2 py-0.5 font-mono text-blue-600">
                    {fromPole?.pole?.pole_code ?? "—"}
                  </span>
                  <i className="bx bx-right-arrow-alt text-slate-400" />
                  <span className="rounded-md bg-orange-900/25 px-2 py-0.5 font-mono text-orange-600">
                    {toPole?.pole?.pole_code ?? "—"}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-white transition hover:bg-white/20"
            >
              <i className="bx bx-x text-lg" />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Pole pair mini-map */}
          <div className="px-6 pt-5">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-zinc-500">
              Span Location Preview
            </p>
            <SpanMiniMap fromPole={fromPole} toPole={toPole} />
          </div>

          {/* Form */}
          <form id="span-form" onSubmit={onSubmit} className="px-6 py-5">
            <SpanFields
              form={form}
              onChange={onChange}
              actualCable={computeActual(
                form.strand_length,
                form.number_of_runs,
              )}
            />
            {error && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
                {error}
              </div>
            )}
          </form>
        </div>

        {/* Footer */}
        <div className="shrink-0 flex gap-3 border-t border-slate-100 px-6 py-4 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className={`flex-1 ${secondaryBtn}`}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="span-form"
            disabled={saving}
            className={`flex-1 ${primaryBtn} disabled:opacity-60 bg-green-600`}
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2 ">
                <i className="bx bx-loader-alt animate-spin" /> Saving…
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2  ">
                <i className="bx bx-plus" /> Add Span
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Main Page
═══════════════════════════════════════════════════════════════════ */

/* ── Span Detail Modal ──────────────────────────────────────────── */
function SpanDetailModal({ span, onClose }: { span: Span; onClose: () => void }) {
  const sc = statusCfg[span.status] ?? statusCfg.pending;
  const expectedCable = span.summary?.expected_cable ?? span.actual_cable;

  const components = [
    { label: "Node",          value: span.summary?.expected_node,         icon: "bx bx-server",    color: "#0b6cff" },
    { label: "Amplifier",     value: span.summary?.expected_amplifier,    icon: "bx bx-broadcast", color: "#8b5cf6" },
    { label: "Extender",      value: span.summary?.expected_extender,     icon: "bx bx-wifi",      color: "#10b981" },
    { label: "TSC",           value: span.summary?.expected_tsc,          icon: "bx bx-chip",      color: "#f59e0b" },
    { label: "Power Supply",  value: span.summary?.expected_powersupply,  icon: "bx bx-plug",      color: "#ef4444" },
    { label: "PSU Case",      value: span.summary?.expected_ps_housing,   icon: "bx bx-box",       color: "#64748b" },
  ] as const;

  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="relative flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl dark:bg-zinc-950">
        {/* Header */}
        <div className="shrink-0 bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-5 dark:from-zinc-950 dark:to-zinc-900">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
                <i className="bx bx-git-branch text-lg text-white" />
              </div>
              <div>
                <p className="text-sm font-black text-white">{span.span_code ?? `Span #${span.id}`}</p>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-white/70">
                  <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono">{span.from_pole?.pole?.pole_code ?? "—"}</span>
                  <i className="bx bx-right-arrow-alt" />
                  <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono">{span.to_pole?.pole?.pole_code ?? "—"}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${sc.badge}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                {sc.label}
              </span>
              <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/15 text-white hover:bg-white/25">
                <i className="bx bx-x text-lg" />
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-5">
          {/* Expected Cable — hero stat */}
          <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 p-5 dark:from-emerald-500/10 dark:to-teal-500/10 dark:border-emerald-500/20">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400 mb-1">Expected Cable</p>
            <p className="text-4xl font-black text-emerald-700 dark:text-emerald-300 tracking-tight">
              {expectedCable != null ? `${expectedCable}m` : "—"}
            </p>
            <div className="mt-3 flex gap-4 text-xs font-semibold text-slate-500 dark:text-zinc-400">
              <span><span className="text-slate-400">Strand:</span> {span.strand_length != null ? `${span.strand_length}m` : "—"}</span>
              <span><span className="text-slate-400">Runs:</span> {span.number_of_runs ?? "—"}</span>
              <span><span className="text-slate-400">Actual:</span> {span.actual_cable != null ? `${span.actual_cable}m` : "—"}</span>
            </div>
          </div>

          {/* Components grid */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-zinc-500 mb-3">Collectable Components</p>
            <div className="grid grid-cols-3 gap-2.5">
              {components.map((c) => (
                <div key={c.label} className="rounded-2xl border border-slate-100 bg-slate-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: c.color + "18" }}>
                      <i className={`${c.icon} text-sm`} style={{ color: c.color }} />
                    </div>
                    <span className="text-xl font-black text-slate-800 dark:text-white tabular-nums">
                      {c.value != null ? c.value : <span className="text-slate-300 dark:text-zinc-600 text-base">—</span>}
                    </span>
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-zinc-500">{c.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NodeSpans() {
  const { siteSlug = "", nodeSlug = "" } = useParams();
  const nodeId = idFromSlug(nodeSlug) || Number(nodeSlug);

  const [node, setNode] = useState<NodeInfo | null>(null);
  const [spans, setSpans] = useState<Span[]>([]);
  const [poles, setPoles] = useState<PoleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [polesLoading, setPolesLoading] = useState(false);
  const [polesError, setPolesError] = useState<string | null>(null);

  const gpsMapRef = useRef<HTMLDivElement>(null);
  const gpsMapObj = useRef<L.Map | null>(null);
  const gpsMarkersRef = useRef<Map<number, L.Marker>>(new Map());
  const gpsLinesRef = useRef<L.Polyline[]>([]);
  const gpsLabelsRef = useRef<L.Marker[]>([]);
  const poleClickRef = useRef<(p: PoleOption) => void>(() => {});
  const spanLabelClickRef = useRef<(s: Span) => void>(() => {});
  // Map-click handler ref (used for "Add Pole" pick mode)
  const mapClickRef = useRef<((lat: number, lng: number) => void) | null>(null);
  const pickMarkerRef = useRef<L.Marker | null>(null);
  const mapStateRef = useRef<{ center: [number, number]; zoom: number } | null>(null);

  const [viewMode, setViewMode] = useState<"list" | "map">("map");
  const [mapSearch, setMapSearch] = useState("");
  const [mapFrom, setMapFrom] = useState<PoleOption | null>(null);
  const [mapTo, setMapTo] = useState<PoleOption | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [sheetForm, setSheetForm] = useState<
    Omit<SpanForm, "from_pole_id" | "to_pole_id">
  >(
    (() => {
      const { from_pole_id: _f, to_pole_id: _t, ...rest } = emptyForm();
      return rest;
    })(),
  );

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | SpanStatus>("all");

  const [detailSpan, setDetailSpan] = useState<Span | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDelOpen, setIsDelOpen] = useState(false);
  const [selected, setSelected] = useState<Span | null>(null);
  const [addForm, setAddForm] = useState<SpanForm>(emptyForm());
  const [editForm, setEditForm] = useState<EditForm>(emptyEdit());
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [delError, setDelError] = useState<string | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);

  // ── Map layer ────────────────────────────────────────────────────
  const [mapLayer, setMapLayer] = useState<"satellite" | "street" | "dark">("street");

  // ── Area / location search ───────────────────────────────────────
  const [areaSearch, setAreaSearch] = useState("");
  const [areaSearching, setAreaSearching] = useState(false);
  const [areaSearchErr, setAreaSearchErr] = useState<string | null>(null);

  async function handleAreaSearch(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = areaSearch.trim();
    if (!q || !gpsMapObj.current) return;
    setAreaSearching(true);
    setAreaSearchErr(null);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + ", Philippines")}&format=json&limit=1`,
        { headers: { "Accept-Language": "en" } },
      );
      const data = await res.json();
      if (!data.length) { setAreaSearchErr("Location not found"); return; }
      const { lat, lon } = data[0];
      gpsMapObj.current.setView([Number(lat), Number(lon)], 16, { animate: true });
    } catch {
      setAreaSearchErr("Search failed");
    } finally {
      setAreaSearching(false);
    }
  }

  // ── Reassign GPS (drag mode) ─────────────────────────────────────
  const [reassignMode, setReassignMode] = useState(false);
  const [reassignMsg, setReassignMsg] = useState<{ code: string; ok: boolean } | null>(null);

  // ── Add Pole (map-click pick mode) ──────────────────────────────
  const [addPoleMode, setAddPoleMode] = useState(false);
  const [addPoleModalOpen, setAddPoleModalOpen] = useState(false);
  const [addPoleLat, setAddPoleLat] = useState("");
  const [addPoleLng, setAddPoleLng] = useState("");
  const [addPoleCode, setAddPoleCode] = useState("");
  const [addPoleSaving, setAddPoleSaving] = useState(false);
  const [addPoleError, setAddPoleError] = useState<string | null>(null);

  useEffect(() => {
    if (!nodeId) return;
    const hit = cacheGet<NodeInfo>(`nodespans_${nodeId}_info`);
    if (hit) setNode(hit);
    fetch(`${SKYCABLE_API}/nodes/${nodeId}`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => {
        const n = d?.data ?? d;
        setNode(n);
        cacheSet(`nodespans_${nodeId}_info`, n);
      })
      .catch(() => {});
  }, [nodeId]);

  useEffect(() => {
    if (!nodeId) return;
    const hit = cacheGet<PoleOption[]>(`nodespans_${nodeId}_poles`);
    if (hit) setPoles(hit);
    else {
      setPolesLoading(true);
      setPolesError(null);
    }
    fetch(`${SKYCABLE_API}/nodes/${nodeId}/poles`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => {
        const arr = Array.isArray(d) ? d : (d?.data ?? null);
        if (arr) {
          setPoles(arr);
          cacheSet(`nodespans_${nodeId}_poles`, arr);
        } else {
          setPolesError(d?.message ?? "Unexpected response");
          setPoles([]);
        }
      })
      .catch((err) => setPolesError(err?.message ?? "Failed to load poles"))
      .finally(() => setPolesLoading(false));
  }, [nodeId]);

  function loadSpans() {
    if (!nodeId) return;
    const hit = cacheGet<Span[]>(`nodespans_${nodeId}_spans`);
    if (hit) {
      setSpans(hit);
      setLoading(false);
    } else setLoading(true);
    fetch(`${SKYCABLE_API}/spans?node_id=${nodeId}`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d : (d.data ?? []);
        setSpans(list);
        cacheSet(`nodespans_${nodeId}_spans`, list);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    loadSpans();
  }, [nodeId]);

  const filtered = spans.filter((s) => {
    const q = search.toLowerCase();
    const matchQ =
      !q ||
      (s.span_code ?? "").toLowerCase().includes(q) ||
      (s.from_pole?.pole?.pole_code ?? "").toLowerCase().includes(q) ||
      (s.to_pole?.pole?.pole_code ?? "").toLowerCase().includes(q);
    return matchQ && (statusFilter === "all" || s.status === statusFilter);
  });

  const counts = {
    total: spans.length,
    pending: spans.filter((s) => s.status === "pending").length,
    in_progress: spans.filter((s) => s.status === "in_progress").length,
    completed: spans.filter((s) => s.status === "completed").length,
  };

  /* ── GPS Leaflet map ── */
  useEffect(() => {
    if (viewMode !== "map") {
      if (gpsMapObj.current) {
        const c = gpsMapObj.current.getCenter();
        mapStateRef.current = { center: [c.lat, c.lng], zoom: gpsMapObj.current.getZoom() };
        gpsMapObj.current.remove();
        gpsMapObj.current = null;
      }
      return;
    }
    // Defer slightly so the DOM ref is guaranteed to be populated after render
    const init = () => {
      if (!gpsMapRef.current) return;
      buildMap();
    };
    const t = setTimeout(init, 50);
    return () => {
      clearTimeout(t);
      if (gpsMapObj.current) { 
        const c = gpsMapObj.current.getCenter();
        mapStateRef.current = { center: [c.lat, c.lng], zoom: gpsMapObj.current.getZoom() };
        gpsMapObj.current.remove(); 
        gpsMapObj.current = null; 
      }
    };

    function buildMap() {
      if (!gpsMapRef.current) return;
      const gpsPoles = poles.filter((p) => p.pole?.lat && p.pole?.lng);

      // Destroy & recreate on poles/spans change
      if (gpsMapObj.current) {
        const c = gpsMapObj.current.getCenter();
        mapStateRef.current = { center: [c.lat, c.lng], zoom: gpsMapObj.current.getZoom() };
        gpsMapObj.current.remove();
        gpsMapObj.current = null;
      }

    // Default to Metro Manila center when no poles have GPS yet
    const lats = gpsPoles.map((p) => Number(p.pole!.lat));
    const lngs = gpsPoles.map((p) => Number(p.pole!.lng));
    const cLat = lats.length ? lats.reduce((a, b) => a + b, 0) / lats.length : 14.5995;
    const cLng = lngs.length ? lngs.reduce((a, b) => a + b, 0) / lngs.length : 120.9842;

    const saved = mapStateRef.current;
    const map = L.map(gpsMapRef.current, {
      zoomControl: true,
      attributionControl: false,
    }).setView(saved ? saved.center : [cLat, cLng], saved ? saved.zoom : 17);
    gpsMapObj.current = map;

    // Base tile layer based on selected mapLayer
    if (mapLayer === "satellite") {
      // Google satellite — full Philippines coverage
      L.tileLayer("https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", { maxZoom: 22, attribution: "© Google" }).addTo(map);
      // Street labels overlay
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png", { maxZoom: 22, opacity: 0.85, subdomains: "abcd" }).addTo(map);
    } else if (mapLayer === "street") {
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors", subdomains: "abc" }).addTo(map);
    } else {
      // Dark
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { maxZoom: 20, subdomains: "abcd" }).addTo(map);
    }

    const markerMap = new Map<number, L.Marker>();
    gpsMarkersRef.current = markerMap;

    const STATUS_HEX: Record<string, string> = {
      pending: "#f59e0b",
      in_progress: "#6366f1",
      cleared: "#10b981",
    };

    function buildIcon(
      poleId: number,
      fromId: number | null,
      toId: number | null,
    ) {
      const isFrom = fromId === poleId;
      const isTo = toId === poleId;
      const pole = poles.find((p) => p.id === poleId);
      const status = pole?.pole?.skycable_status ?? "pending";
      const color = isFrom
        ? "#2563eb"
        : isTo
          ? "#f97316"
          : (STATUS_HEX[status] ?? "#f59e0b");
      const ring = isFrom || isTo ? `box-shadow:0 0 0 4px ${color}55;` : "";
      return L.divIcon({
        className: "",
        html: `<div style="width:28px;height:28px;border-radius:50%;background:${color};border:3px solid #fff;${ring}box-shadow:0 4px 14px rgba(0,0,0,.4);cursor:pointer;display:flex;align-items:center;justify-content:center;">
                 <div style="width:7px;height:7px;border-radius:50%;background:#fff;"></div>
               </div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
    }

    gpsPoles.forEach((p) => {
      const lat = Number(p.pole!.lat),
        lng = Number(p.pole!.lng);
      const code = p.pole?.pole_code ?? `P${p.id}`;
      const poleDbId = p.pole?.id ?? p.id;

      // In reassign mode: green drag icon; otherwise normal status icon
      const icon = reassignMode
        ? L.divIcon({
            className: "",
            html: `<div style="width:32px;height:32px;border-radius:50%;background:#10b981;border:3px solid #fff;box-shadow:0 0 0 3px #10b98155,0 4px 14px rgba(0,0,0,.45);cursor:grab;display:flex;align-items:center;justify-content:center;">
                     <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M11 5h2v14h-2zm-5 5l-2 2 2 2V10zm12 0v4l2-2-2-2z"/></svg>
                   </div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          })
        : buildIcon(p.id, mapFrom?.id ?? null, mapTo?.id ?? null);

      const marker = L.marker([lat, lng], { icon, draggable: reassignMode })
        .addTo(map)
        .bindTooltip(
          `<b style="font-family:monospace">${code}</b>${reassignMode ? "<br/><span style='font-size:10px;opacity:.7'>Drag to move</span>" : ""}`,
          { permanent: false, direction: "top", offset: [0, -16] },
        );

      if (reassignMode) {
        marker.on("dragend", async () => {
          const { lat: newLat, lng: newLng } = marker.getLatLng();
          try {
            const res = await fetch(`${SKYCABLE_API}/poles/${poleDbId}/gps`, {
              method: "POST",
              headers: authHeaders(),
              body: JSON.stringify({ lat: newLat, lng: newLng }),
            });
            if (!res.ok) throw new Error("Failed");
            // Don't rebuild the map on every drag — just show a toast.
            // Poles reload when user clicks "Done Dragging".
            setReassignMsg({ code, ok: true });
          } catch {
            setReassignMsg({ code, ok: false });
            // Snap back to original position on error
            marker.setLatLng([lat, lng]);
          }
          setTimeout(() => setReassignMsg(null), 2500);
        });
      } else {
        marker.on("click", () => poleClickRef.current(p));
      }

      markerMap.set(p.id, marker);
    });

    // Draw span lines with strand_length labels
    gpsLinesRef.current.forEach((l) => l.remove());
    gpsLabelsRef.current.forEach((l) => l.remove());
    gpsLinesRef.current = [];
    gpsLabelsRef.current = [];

    spans.forEach((s) => {
      const fp = s.from_pole && poles.find((p) => p.id === s.from_pole!.id);
      const tp = s.to_pole && poles.find((p) => p.id === s.to_pole!.id);
      if (!fp?.pole?.lat || !tp?.pole?.lat) return;
      const fLat = Number(fp.pole.lat),
        fLng = Number(fp.pole.lng);
      const tLat = Number(tp.pole.lat),
        tLng = Number(tp.pole.lng);
      const color =
        s.status === "completed"
          ? "#10b981"
          : s.status === "in_progress"
            ? "#8b5cf6"
            : "#64748b";
      const line = L.polyline(
        [
          [fLat, fLng],
          [tLat, tLng],
        ],
        {
          color,
          weight: 5,
          opacity: 0.9,
          dashArray: s.status === "pending" ? "10 6" : undefined,
        },
      ).addTo(map);
      gpsLinesRef.current.push(line);

      const cableDisplay = s.actual_cable ?? (s.strand_length && s.number_of_runs ? s.strand_length * s.number_of_runs : null);
      if (cableDisplay != null) {
        const midLat = (fLat + tLat) / 2,
          midLng = (fLng + tLng) / 2;
        const hasComponents = [
          s.summary?.expected_node,
          s.summary?.expected_amplifier,
          s.summary?.expected_extender,
          s.summary?.expected_tsc,
          s.summary?.expected_powersupply,
          s.summary?.expected_ps_housing,
        ].some(v => v != null && v > 0);
        const label = L.marker([midLat, midLng], {
          icon: L.divIcon({
            className: "",
            html: `<div style="background:rgba(15,23,42,0.88);color:#fff;padding:3px 10px;border-radius:8px;font-size:11px;font-weight:800;white-space:nowrap;backdrop-filter:blur(6px);cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.35);display:flex;align-items:center;gap:5px;border:1px solid rgba(255,255,255,0.12);">
              <span>${cableDisplay}m</span>
              ${hasComponents ? '<span style="width:5px;height:5px;border-radius:50%;background:#f59e0b;flex-shrink:0;"></span>' : ''}
            </div>`,
            iconSize: [90, 24],
            iconAnchor: [45, 12],
          }),
          interactive: true,
        }).addTo(map);
        label.on("click", () => spanLabelClickRef.current(s));
        gpsLabelsRef.current.push(label);
      }
    });

    // Map click → "Add Pole" pick mode
    map.on("click", (e: L.LeafletMouseEvent) => {
      if (!mapClickRef.current) return;
      mapClickRef.current(e.latlng.lat, e.latlng.lng);
    });

      setTimeout(() => {
        map.invalidateSize();
        if (gpsPoles.length > 1 && !saved) {
          map.fitBounds(
            gpsPoles.map((p) => [Number(p.pole!.lat), Number(p.pole!.lng)] as [number, number]),
            { padding: [40, 40], maxZoom: 18 },
          );
        }
      }, 160);
    } // end buildMap
  }, [poles, spans, viewMode, reassignMode, mapLayer]);

  // Update marker icons when from/to selection changes without full map rebuild
  useEffect(() => {
    const markerMap = gpsMarkersRef.current;
    if (!gpsMapObj.current || !markerMap.size) return;
    const STATUS_HEX: Record<string, string> = {
      pending: "#f59e0b",
      in_progress: "#6366f1",
      cleared: "#10b981",
    };
    markerMap.forEach((marker, poleId) => {
      const isFrom = mapFrom?.id === poleId;
      const isTo = mapTo?.id === poleId;
      const pole = poles.find((p) => p.id === poleId);
      const status = pole?.pole?.skycable_status ?? "pending";
      const color = isFrom
        ? "#2563eb"
        : isTo
          ? "#f97316"
          : (STATUS_HEX[status] ?? "#f59e0b");
      const ring = isFrom || isTo ? `box-shadow:0 0 0 4px ${color}55;` : "";
      marker.setIcon(
        L.divIcon({
          className: "",
          html: `<div style="width:28px;height:28px;border-radius:50%;background:${color};border:3px solid #fff;${ring}box-shadow:0 4px 14px rgba(0,0,0,.4);cursor:pointer;display:flex;align-items:center;justify-content:center;">
                 <div style="width:7px;height:7px;border-radius:50%;background:#fff;"></div>
               </div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
      );
    });
  }, [mapFrom, mapTo]);

  /* ── Map pole click ── */
  function handleMapPoleClick(p: PoleOption) {
    if (reassignMode) return; // dragging handles GPS; don't select for spans
    if (!mapFrom) {
      setMapFrom(p);
      setMapTo(null);
    } else if (mapFrom.id === p.id) {
      setMapFrom(null);
    } else if (!mapTo) {
      setMapTo(p);
      const { from_pole_id: _f, to_pole_id: _t, ...rest } = emptyForm();
      setSheetForm(rest);
      setSheetError(null);
      setIsSheetOpen(true);
    } else {
      setMapFrom(p);
      setMapTo(null);
      setIsSheetOpen(false);
    }
  }
  // Keep the ref in sync so Leaflet click handlers always call the latest version
  poleClickRef.current = handleMapPoleClick;
  spanLabelClickRef.current = (s: Span) => setDetailSpan(s);

  // Wire mapClickRef: in addPoleMode, a map click drops a pick-marker and opens the modal
  mapClickRef.current = addPoleMode
    ? (lat: number, lng: number) => {
        // Drop / move a temporary marker on the map
        if (pickMarkerRef.current) pickMarkerRef.current.remove();
        const icon = L.divIcon({
          className: "",
          html: `<div style="width:22px;height:22px;border-radius:50%;background:#10b981;border:3px solid #fff;box-shadow:0 0 0 4px #10b98155,0 4px 14px rgba(0,0,0,.4);"></div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });
        if (gpsMapObj.current) {
          pickMarkerRef.current = L.marker([lat, lng], { icon }).addTo(
            gpsMapObj.current,
          );
        }
        setAddPoleLat(lat.toFixed(7));
        setAddPoleLng(lng.toFixed(7));
        setAddPoleCode("");
        setAddPoleError(null);
        setAddPoleModalOpen(true);
      }
    : null;

  // Update map cursor based on active mode
  useEffect(() => {
    const container = gpsMapObj.current?.getContainer();
    if (!container) return;
    container.style.cursor = addPoleMode ? "crosshair" : reassignMode ? "grab" : "";
  }, [addPoleMode, reassignMode]);

  async function handleAddPole(e: React.FormEvent) {
    e.preventDefault();
    if (!addPoleCode.trim()) {
      setAddPoleError("Pole code is required");
      return;
    }
    setAddPoleSaving(true);
    setAddPoleError(null);
    try {
      const res = await fetch(`${SKYCABLE_API}/poles`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          pole_code: addPoleCode.trim().toUpperCase(),
          node_id: nodeId,
          lat: addPoleLat || null,
          lng: addPoleLng || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Failed to add pole");
      // Clear pick state and refresh poles list
      pickMarkerRef.current?.remove();
      pickMarkerRef.current = null;
      setAddPoleModalOpen(false);
      setAddPoleMode(false);
      // Reload poles
      const pr = await fetch(`${SKYCABLE_API}/nodes/${nodeId}/poles`, {
        headers: authHeaders(),
      });
      const pd = await pr.json();
      const arr = Array.isArray(pd) ? pd : (pd?.data ?? []);
      setPoles(arr);
      cacheSet(`nodespans_${nodeId}_poles`, arr);
    } catch (err) {
      setAddPoleError(
        err instanceof Error ? err.message : "Something went wrong",
      );
    } finally {
      setAddPoleSaving(false);
    }
  }

  function cancelAddPole() {
    pickMarkerRef.current?.remove();
    pickMarkerRef.current = null;
    setAddPoleMode(false);
    setAddPoleModalOpen(false);
    setAddPoleError(null);
  }

  function mcClear() {
    setMapFrom(null);
    setMapTo(null);
    setIsSheetOpen(false);
    setSheetError(null);
  }

  /* ── Submission ── */
  async function submitSpan(payload: object): Promise<Span | null> {
    const spanCode = generateSpanCode();
    const res = await fetch(`${SKYCABLE_API}/spans`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ span_code: spanCode, ...payload }),
    });
    const data = await res.json();
    if (!res.ok) {
      const msg =
        (data.message as string | undefined) ??
        (Object.values(data.errors ?? {}) as string[][])?.[0]?.[0] ??
        "Failed to add span";
      throw new Error(msg);
    }
    return data as Span;
  }

  async function handleSheetSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!mapFrom || !mapTo) return;
    setSaving(true);
    setSheetError(null);
    try {
      const actual = computeActual(
        sheetForm.strand_length,
        sheetForm.number_of_runs,
      );
      await submitSpan({
        node_id: nodeId,
        from_pole_id: mapFrom.id,
        to_pole_id: mapTo.id,
        strand_length: sheetForm.strand_length
          ? Number(sheetForm.strand_length)
          : null,
        number_of_runs: sheetForm.number_of_runs
          ? Number(sheetForm.number_of_runs)
          : null,
        actual_cable: actual ? Number(actual) : null,
        nodes_count: sheetForm.nodes_count
          ? Number(sheetForm.nodes_count)
          : null,
        amplifier: sheetForm.amplifier ? Number(sheetForm.amplifier) : null,
        extender: sheetForm.extender ? Number(sheetForm.extender) : null,
        tsc: sheetForm.tsc ? Number(sheetForm.tsc) : null,
        power_supply: sheetForm.power_supply
          ? Number(sheetForm.power_supply)
          : null,
        power_supply_case: sheetForm.power_supply_case
          ? Number(sheetForm.power_supply_case)
          : null,
      });
      mcClear();
      loadSpans();
    } catch (err) {
      setSheetError(
        err instanceof Error ? err.message : "Something went wrong",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleManualAdd(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setAddError(null);
    try {
      const actual = computeActual(
        addForm.strand_length,
        addForm.number_of_runs,
      );
      await submitSpan({
        node_id: nodeId,
        from_pole_id: addForm.from_pole_id,
        to_pole_id: addForm.to_pole_id,
        strand_length: addForm.strand_length
          ? Number(addForm.strand_length)
          : null,
        number_of_runs: addForm.number_of_runs
          ? Number(addForm.number_of_runs)
          : null,
        actual_cable: actual ? Number(actual) : null,
        nodes_count: addForm.nodes_count ? Number(addForm.nodes_count) : null,
        amplifier: addForm.amplifier ? Number(addForm.amplifier) : null,
        extender: addForm.extender ? Number(addForm.extender) : null,
        tsc: addForm.tsc ? Number(addForm.tsc) : null,
        power_supply: addForm.power_supply
          ? Number(addForm.power_supply)
          : null,
        power_supply_case: addForm.power_supply_case
          ? Number(addForm.power_supply_case)
          : null,
      });
      setIsAddOpen(false);
      setAddForm(emptyForm());
      loadSpans();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    setEditError(null);
    try {
      const actual = computeActual(
        editForm.strand_length,
        editForm.number_of_runs,
      );
      const res = await fetch(`${SKYCABLE_API}/spans/${selected.id}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({
          strand_length: editForm.strand_length
            ? Number(editForm.strand_length)
            : null,
          number_of_runs: editForm.number_of_runs
            ? Number(editForm.number_of_runs)
            : null,
          actual_cable: actual ? Number(actual) : null,
          nodes_count: editForm.nodes_count
            ? Number(editForm.nodes_count)
            : null,
          amplifier: editForm.amplifier ? Number(editForm.amplifier) : null,
          extender: editForm.extender ? Number(editForm.extender) : null,
          tsc: editForm.tsc ? Number(editForm.tsc) : null,
          power_supply: editForm.power_supply
            ? Number(editForm.power_supply)
            : null,
          power_supply_case: editForm.power_supply_case
            ? Number(editForm.power_supply_case)
            : null,
          status: editForm.status || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Failed to update");
      setIsEditOpen(false);
      setSelected(null);
      loadSpans();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selected) return;
    setSaving(true);
    setDelError(null);
    try {
      const res = await fetch(`${SKYCABLE_API}/spans/${selected.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Failed to delete");
      setIsDelOpen(false);
      setSelected(null);
      setSpans((prev) => prev.filter((s) => s.id !== selected.id));
    } catch (err) {
      setDelError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const poleLabel = (p: PoleOption) => p.pole?.pole_code ?? `Pole #${p.id}`;
  const dash = <span className="text-slate-300 dark:text-zinc-600">—</span>;
  const n = (v: number | null | undefined) => (v != null ? v : dash);

  /* ── Map step indicator ── */
  const mapStep = !mapFrom ? 1 : !mapTo ? 2 : 3;

  return (
    <div className="flex flex-col gap-5 pb-10">
      {/* Breadcrumb */}
      <nav className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
        <Link to="/sites" className="transition hover:text-emerald-600">
          Sites
        </Link>
        <i className="bx bx-chevron-right text-sm" />
        <Link
          to={`/sites/${node?.area?.id ?? siteSlug}/nodes`}
          className="transition hover:text-emerald-600"
        >
          Nodes
        </Link>
        <i className="bx bx-chevron-right text-sm" />
        <Link
          to={`/sites/${node?.area?.id ?? siteSlug}/nodes/${nodeId}`}
          className="transition hover:text-emerald-600 font-semibold"
        >
          {node?.full_label ?? node?.name ?? "Node"}
        </Link>
        <i className="bx bx-chevron-right text-sm" />
        <span className="font-bold text-slate-600 dark:text-slate-300">
          Spans
        </span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h4 className="text-[20px] font-black text-slate-900 dark:text-slate-100">
            {node?.full_label ?? node?.name ?? "…"} — Spans
          </h4>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {viewMode === "map"
              ? "Click a pole on the GPS map to set FROM, click another to set TO — then fill span details"
              : "Manage and view all declared spans in list format"}
          </p>
        </div>
        <Link
          to={`/sites/${node?.area?.id ?? siteSlug}/nodes/${nodeId}`}
          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 shadow-sm hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 transition"
        >
          <i className="bx bx-arrow-back text-sm" />
          Back to Node
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(
          [
            {
              label: "Total Spans",
              value: counts.total,
              icon: "bx bx-git-branch",
              accent: "from-[#0b6cff] to-[#00a6ff]",
            },
            {
              label: "Pending Spans",
              value: counts.pending,
              icon: "bx bx-time-five",
              accent: "from-amber-400 to-orange-400",
            },
            {
              label: "Ongoing Spans",
              value: counts.in_progress,
              icon: "bx bx-play-circle",
              accent: "from-indigo-500 to-violet-500",
            },
            {
              label: "Cleared Spans",
              value: counts.completed,
              icon: "bx bx-check-shield",
              accent: "from-emerald-500 to-teal-500",
            },
          ] as const
        ).map((c) => (
          <div
            key={c.label}
            className="overflow-hidden rounded-[26px] bg-white shadow-sm ring-1 ring-slate-200/70 dark:bg-zinc-900 dark:ring-zinc-800"
          >
            <div className={`h-1 bg-gradient-to-r ${c.accent}`} />
            <div className="flex items-start justify-between p-5">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-400 dark:text-zinc-500">
                  {c.label}
                </p>
                <p className="mt-5 text-3xl font-black tracking-tight text-slate-900 dark:text-white">
                  {c.value}
                </p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-50 text-slate-400 dark:bg-zinc-800">
                <i className={`${c.icon} text-xl`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Span Connector Card (Map mode) */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 dark:bg-zinc-800 dark:ring-zinc-700">
        {/* Map toolbar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-white px-5 py-3 dark:border-zinc-700 dark:from-zinc-800/80 dark:to-zinc-800">
          {/* View tabs */}
          <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-zinc-700 dark:bg-zinc-900">
            {(["map", "list"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${viewMode === m ? "bg-white text-slate-800 shadow-sm dark:bg-zinc-700 dark:text-slate-100" : "text-slate-500 hover:text-slate-700 dark:text-zinc-500"}`}
              >
                <i
                  className={`bx ${m === "map" ? "bx-map-alt" : "bx-list-ul"} text-sm`}
                />
                {m === "map" ? "GPS Map" : "List"}
              </button>
            ))}
          </div>

          {/* Steps (map mode) */}
          {viewMode === "map" && (
            <div className="flex items-center gap-2">
              {[
                { n: 1, label: "① FROM pole" },
                { n: 2, label: "② TO pole" },
                { n: 3, label: "③ Fill details" },
              ].map((s) => (
                <span
                  key={s.n}
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${mapStep === s.n ? "bg-sky-100 text-sky-700 ring-1 ring-sky-200" : mapStep > s.n ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200" : "bg-slate-100 text-slate-400 ring-1 ring-slate-200"}`}
                >
                  {mapStep > s.n ? <i className="bx bx-check mr-0.5" /> : null}
                  {s.label}
                </span>
              ))}
            </div>
          )}

          {/* Selection display (map mode) */}
          {viewMode === "map" && (mapFrom || mapTo) && (
            <div className="flex items-center gap-2 text-xs font-semibold">
              <span
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 ${mapFrom ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}
              >
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {mapFrom
                  ? (mapFrom.pole?.pole_code ?? `P${mapFrom.id}`)
                  : "Not selected"}
              </span>
              <i className="bx bx-right-arrow-alt text-slate-300" />
              <span
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 ${mapTo ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-400"}`}
              >
                <span className="h-2 w-2 rounded-full bg-orange-500" />
                {mapTo
                  ? (mapTo.pole?.pole_code ?? `P${mapTo.id}`)
                  : "Not selected"}
              </span>
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            {viewMode === "map" && mapFrom && (
              <button
                onClick={mcClear}
                className="inline-flex h-8 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-500 hover:bg-slate-50"
              >
                <i className="bx bx-x" /> Clear
              </button>
            )}
            {viewMode === "map" && (
              <>
                {/* Reassign GPS drag mode */}
                <button
                  onClick={async () => {
                    const wasOn = reassignMode;
                    setReassignMode((v) => !v);
                    if (!reassignMode) { setAddPoleMode(false); cancelAddPole(); }
                    // Reload poles fresh from server only when exiting drag mode
                    if (wasOn) {
                      const pr = await fetch(`${SKYCABLE_API}/nodes/${nodeId}/poles`, { headers: authHeaders() });
                      const pd = await pr.json();
                      const arr = Array.isArray(pd) ? pd : (pd?.data ?? []);
                      setPoles(arr);
                      cacheSet(`nodespans_${nodeId}_poles`, arr);
                    }
                  }}
                  className={`inline-flex h-9 items-center gap-2 rounded-xl px-4 text-xs font-semibold text-white shadow-md shadow-green-500/30 transition ${
                    reassignMode
                      ? "bg-green-600 ring-2 ring-green-400 hover:bg-green-700"
                      : "bg-green-600 hover:bg-green-700"
                  }`}
                >
                  <i className={`bx ${reassignMode ? "bx-x" : "bx-move"} text-sm`} />
                  {reassignMode ? "Done Dragging" : "Reassign GPS"}
                </button>

                {/* Add Pole pick mode */}
                <button
                  onClick={() => {
                    const next = !addPoleMode;
                    setAddPoleMode(next);
                    if (next) setReassignMode(false);
                    if (!next && addPoleModalOpen) cancelAddPole();
                  }}
                  className={`inline-flex h-9 items-center gap-2 rounded-xl px-4 text-xs font-semibold text-white shadow-md shadow-green-500/30 transition ${
                    addPoleMode
                      ? "bg-green-600 ring-2 ring-green-400 hover:bg-green-700"
                      : "bg-green-600 hover:bg-green-700"
                  }`}
                >
                  <i className={`bx ${addPoleMode ? "bx-x" : "bx-map-pin"} text-sm`} />
                  {addPoleMode ? "Cancel Pick" : "Add Pole"}
                </button>
              </>
            )}
            <button
              onClick={() => {
                setAddForm(emptyForm());
                setIsAddOpen(true);
              }}
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-green-600 px-4 text-xs font-semibold text-white shadow-md shadow-green-500/30 hover:bg-green-700"
            >
              <i className="bx bx-edit text-sm" /> Manual
            </button>
            {viewMode === "list" && (
              <button
                onClick={() => {
                  setAddForm(emptyForm());
                  setIsAddOpen(true);
                }}
                className="inline-flex h-9 items-center gap-2 rounded-xl bg-sky-600 px-4 text-xs font-semibold text-white shadow-md shadow-sky-500/30 hover:bg-sky-700"
              >
                <i className="bx bx-plus text-sm" /> Add Span
              </button>
            )}
          </div>
        </div>

        {/* Map + Sidebar layout */}
        {viewMode === "map" && (
          <div className="flex" style={{ minHeight: 420 }}>
            {/* GPS Leaflet map */}
            <div
              className="relative flex-1 overflow-hidden border-r border-slate-100 dark:border-zinc-700"
              style={{ minHeight: 420 }}
            >
              {polesLoading ? (
                <div
                  className="flex h-full items-center justify-center"
                  style={{ minHeight: 420 }}
                >
                  <i className="bx bx-loader-alt animate-spin text-2xl text-sky-500" />
                </div>
              ) : polesError ? (
                <div
                  className="flex h-full flex-col items-center justify-center gap-2 text-sm text-red-500"
                  style={{ minHeight: 420 }}
                >
                  <i className="bx bx-error-circle text-2xl" />
                  {polesError}
                </div>
              ) : (
                <div
                  className="relative"
                  style={{ width: "100%", height: "100%", minHeight: 420 }}
                >
                  <div
                    ref={gpsMapRef}
                    style={{ width: "100%", height: "100%", minHeight: 420 }}
                  />
                  {/* Area search */}
                  <div className="absolute left-3 top-3 z-[999] w-64">
                    <form onSubmit={handleAreaSearch} className="flex gap-1.5">
                      <div className="relative flex-1">
                        <i className="bx bx-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
                        <input
                          value={areaSearch}
                          onChange={e => { setAreaSearch(e.target.value); setAreaSearchErr(null); }}
                          placeholder="Search area or barangay…"
                          className="h-9 w-full rounded-xl border border-slate-200 bg-white/95 pl-8 pr-3 text-xs text-slate-700 shadow-md outline-none focus:border-green-400 focus:ring-2 focus:ring-green-400/20 dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-white"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={areaSearching}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-green-600 text-white shadow-md hover:bg-green-700 disabled:opacity-60"
                      >
                        {areaSearching
                          ? <i className="bx bx-loader-alt animate-spin text-sm" />
                          : <i className="bx bx-search text-sm" />}
                      </button>
                    </form>
                    {areaSearchErr && (
                      <div className="mt-1 rounded-lg bg-red-600/90 px-3 py-1.5 text-[11px] font-semibold text-white shadow">
                        {areaSearchErr}
                      </div>
                    )}
                  </div>

                  {/* Layer switcher */}
                  <div className="absolute bottom-4 right-3 z-[999] flex flex-col gap-1">
                    {(["satellite", "street", "dark"] as const).map((l) => (
                      <button
                        key={l}
                        onClick={() => setMapLayer(l)}
                        className={`flex h-8 items-center gap-1.5 rounded-xl px-3 text-[11px] font-bold shadow-lg transition ${
                          mapLayer === l
                            ? "bg-green-600 text-white"
                            : "bg-white/90 text-slate-700 hover:bg-white dark:bg-zinc-800/90 dark:text-zinc-200"
                        }`}
                      >
                        <i className={`bx ${l === "satellite" ? "bx-satellite" : l === "street" ? "bx-map" : "bx-moon"} text-sm`} />
                        {l.charAt(0).toUpperCase() + l.slice(1)}
                      </button>
                    ))}
                  </div>

                  {/* Add Pole hint */}
                  {addPoleMode && (
                    <div className="pointer-events-none absolute left-1/2 top-3 z-[999] -translate-x-1/2">
                      <div className="flex items-center gap-2 rounded-2xl bg-emerald-600/90 px-4 py-2 text-xs font-bold text-white shadow-lg backdrop-blur-sm">
                        <i className="bx bx-map-pin text-base" />
                        Click anywhere on the map to place the new pole
                      </div>
                    </div>
                  )}

                  {/* Reassign GPS hint */}
                  {reassignMode && (
                    <div className="pointer-events-none absolute left-1/2 top-3 z-[999] -translate-x-1/2">
                      <div className="flex items-center gap-2 rounded-2xl bg-amber-500/95 px-4 py-2 text-xs font-bold text-white shadow-lg backdrop-blur-sm">
                        <i className="bx bx-move text-base" />
                        Drag any pole marker to update its GPS location
                      </div>
                    </div>
                  )}

                  {/* Drag save toast */}
                  {reassignMsg && (
                    <div className={`pointer-events-none absolute bottom-4 left-1/2 z-[999] -translate-x-1/2 flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-bold text-white shadow-xl backdrop-blur-sm transition ${
                      reassignMsg.ok ? "bg-emerald-600/95" : "bg-red-600/95"
                    }`}>
                      <i className={`bx ${reassignMsg.ok ? "bx-check-circle" : "bx-x-circle"} text-base`} />
                      {reassignMsg.ok
                        ? `GPS updated for ${reassignMsg.code}`
                        : `Failed to update GPS for ${reassignMsg.code}`}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div
              className="w-[260px] shrink-0 overflow-y-auto"
              style={{ maxHeight: 480 }}
            >
              {/* Legend */}
              <div className="border-b border-slate-100 px-4 py-3 dark:border-zinc-700">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
                  Legend
                </p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { color: "#2563eb", label: "FROM" },
                    { color: "#f97316", label: "TO" },
                    { color: "#10b981", label: "Completed" },
                    { color: "#f59e0b", label: "Pending" },
                  ].map((l) => (
                    <span
                      key={l.label}
                      className="flex items-center gap-1 text-[11px] font-semibold text-slate-500"
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: l.color }}
                      />
                      {l.label}
                    </span>
                  ))}
                </div>
              </div>

              {/* Summary */}
              <div className="border-b border-slate-100 px-4 py-3 dark:border-zinc-700">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
                  Summary
                </p>
                <div className="space-y-1.5 text-xs font-medium text-slate-500">
                  <div className="flex justify-between">
                    <span>Total Poles</span>
                    <span className="font-bold text-slate-700">
                      {poles.length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Spans</span>
                    <span className="font-bold text-slate-700">
                      {spans.length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Completed</span>
                    <span className="font-bold text-emerald-600">
                      {spans.filter((s) => s.status === "completed").length}
                    </span>
                  </div>
                </div>
              </div>

              {/* Poles directory */}
              <div className="px-4 py-3">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
                  Poles Directory
                </p>
                <div className="relative mb-2">
                  <i className="bx bx-search absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400" />
                  <input
                    value={mapSearch}
                    onChange={(e) => setMapSearch(e.target.value)}
                    placeholder="Search pole…"
                    className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-7 pr-3 text-xs text-slate-600 outline-none focus:border-sky-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-slate-300"
                  />
                </div>
                <div className="max-h-[220px] space-y-0.5 overflow-y-auto pr-1">
                  {poles
                    .filter(
                      (p) =>
                        !mapSearch ||
                        (p.pole?.pole_code ?? "")
                          .toLowerCase()
                          .includes(mapSearch.toLowerCase()),
                    )
                    .map((p) => {
                      const isFrom = mapFrom?.id === p.id;
                      const isTo = mapTo?.id === p.id;
                      const isCleared = p.pole?.skycable_status === "cleared";
                      return (
                        <button
                          key={p.id}
                          onClick={() => handleMapPoleClick(p)}
                          className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold transition ${isFrom ? "bg-blue-50 text-blue-700" : isTo ? "bg-orange-50 text-orange-700" : "text-slate-600 hover:bg-slate-50 dark:text-zinc-400 dark:hover:bg-zinc-700"}`}
                        >
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{
                              background: isFrom
                                ? "#2563eb"
                                : isTo
                                  ? "#f97316"
                                  : isCleared
                                    ? "#10b981"
                                    : "#f59e0b",
                            }}
                          />
                          <span className="font-mono">
                            {p.pole?.pole_code ?? `P${p.id}`}
                          </span>
                        </button>
                      );
                    })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* List mode: search + table */}
        {viewMode === "list" && (
          <>
            <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-3 dark:border-zinc-700">
              <div className="relative min-w-[200px] max-w-md w-full">
                <i className="bx bx-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search span or pole…"
                  className="h-9 w-full rounded-2xl border border-slate-200 bg-white pl-9 pr-4 text-xs text-slate-600 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/15 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                />
              </div>
              <div className="relative">
                <select
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as typeof statusFilter)
                  }
                  className="h-9 appearance-none rounded-2xl border border-slate-200 bg-white pl-3 pr-8 text-xs text-slate-600 outline-none focus:border-emerald-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                >
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="in_progress">Ongoing</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <i className="bx bx-chevron-down pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400" />
              </div>
              <span className="text-xs text-slate-400 dark:text-zinc-500">
                {filtered.length} spans
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-[#f8fafc] dark:border-zinc-800 dark:bg-zinc-900/60">
                    <th
                      colSpan={7}
                      className="border-r border-slate-200 dark:border-zinc-800 px-3 py-2 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-500"
                    >
                      Cable Measurement
                    </th>
                    <th
                      colSpan={6}
                      className="px-3 py-2 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-500"
                    >
                      Collectable Components
                    </th>
                    <th className="px-3 py-2" />
                    <th className="px-3 py-2" />
                  </tr>
                  <tr className="border-b border-slate-200 bg-[#f8fafc] dark:border-zinc-800 dark:bg-zinc-900/60">
                    {[
                      "#",
                      "Span ID",
                      "From",
                      "To",
                      "Strand",
                      "Runs",
                      "Actual Cable",
                      "Nodes",
                      "Amp",
                      "Ext",
                      "TSC",
                      "PS",
                      "PS Case",
                      "Status",
                      "Actions",
                    ].map((h) => (
                      <th
                        key={h}
                        className="whitespace-nowrap px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-500"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={15} className="py-16 text-center">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-500/10">
                          <i className="bx bx-loader-alt animate-spin text-2xl text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <p className="mt-3 text-sm text-slate-400 dark:text-zinc-500">
                          Loading…
                        </p>
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={15} className="py-16 text-center">
                        <i className="bx bx-git-branch text-3xl text-slate-300 dark:text-zinc-700" />
                        <p className="mt-2 text-sm text-slate-400 dark:text-zinc-500">
                          No spans found
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((s, idx) => {
                      const sc = statusCfg[s.status] ?? statusCfg.pending;
                      return (
                        <tr
                          key={s.id}
                          className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 dark:border-zinc-800/60 dark:hover:bg-zinc-800/40 cursor-pointer"
                          onClick={() => setDetailSpan(s)}
                        >
                          <td className="px-3 py-3 text-[11px] font-bold tabular-nums text-slate-300 dark:text-zinc-600">
                            {idx + 1}
                          </td>
                          <td className="px-3 py-3 font-mono text-[11px] font-semibold text-slate-500">
                            {s.span_code ?? dash}
                          </td>
                          <td className="px-3 py-3 font-mono text-xs text-emerald-600 dark:text-emerald-400 font-bold">
                            {s.from_pole?.pole?.pole_code ?? dash}
                          </td>
                          <td className="px-3 py-3 font-mono text-xs text-emerald-600 dark:text-emerald-400 font-bold">
                            {s.to_pole?.pole?.pole_code ?? dash}
                          </td>
                          <td className="px-3 py-3 text-xs tabular-nums text-slate-600 dark:text-zinc-300">
                            {s.strand_length != null
                              ? `${s.strand_length}m`
                              : dash}
                          </td>
                          <td className="px-3 py-3 text-xs tabular-nums text-slate-600 dark:text-zinc-300">
                            {n(s.number_of_runs)}
                          </td>
                          <td className="px-3 py-3 text-xs tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                            {s.actual_cable != null
                              ? `${s.actual_cable}m`
                              : dash}
                          </td>
                          <td className="px-3 py-3 text-xs tabular-nums text-slate-600 dark:text-zinc-300">
                            {n(getComp(s, "node"))}
                          </td>
                          <td className="px-3 py-3 text-xs tabular-nums text-slate-600 dark:text-zinc-300">
                            {n(getComp(s, "amplifier"))}
                          </td>
                          <td className="px-3 py-3 text-xs tabular-nums text-slate-600 dark:text-zinc-300">
                            {n(getComp(s, "extender"))}
                          </td>
                          <td className="px-3 py-3 text-xs tabular-nums text-slate-600 dark:text-zinc-300">
                            {n(getComp(s, "tsc"))}
                          </td>
                          <td className="px-3 py-3 text-xs tabular-nums text-slate-600 dark:text-zinc-300">
                            {n(getComp(s, "powersupply"))}
                          </td>
                          <td className="px-3 py-3 text-xs tabular-nums text-slate-600 dark:text-zinc-300">
                            {n(getComp(s, "powersupply_case"))}
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${sc.badge}`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${sc.dot}`}
                              />
                              {sc.label}
                            </span>
                          </td>
                          <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={(e) => { e.stopPropagation(); setDetailSpan(s); }}
                                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-sky-50 hover:text-sky-600 dark:hover:bg-sky-500/10 dark:hover:text-sky-400 transition"
                                title="View details"
                              >
                                <i className="bx bx-show text-sm" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelected(s);
                                  const gc = (type: string) => {
                                    const v = getComp(s, type);
                                    return v != null ? String(v) : "";
                                  };
                                  setEditForm({
                                    from_pole_id: s.from_pole?.id ?? "",
                                    to_pole_id: s.to_pole?.id ?? "",
                                    strand_length:
                                      s.strand_length != null
                                        ? String(s.strand_length)
                                        : "",
                                    number_of_runs:
                                      s.number_of_runs != null
                                        ? String(s.number_of_runs)
                                        : "",
                                    nodes_count: gc("node"),
                                    amplifier: gc("amplifier"),
                                    extender: gc("extender"),
                                    tsc: gc("tsc"),
                                    power_supply: gc("powersupply"),
                                    power_supply_case: gc("powersupply_case"),
                                    status: s.status,
                                  });
                                  setIsEditOpen(true);
                                }}
                                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-400 transition"
                              >
                                <i className="bx bx-edit text-sm" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setSelected(s); setIsDelOpen(true); }}
                                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400 transition"
                              >
                                <i className="bx bx-trash text-sm" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Span Detail Modal */}
      {detailSpan && <SpanDetailModal span={detailSpan} onClose={() => setDetailSpan(null)} />}

      {/* Bottom Sheet (map mode span form) */}
      <BottomSheet
        open={isSheetOpen}
        fromPole={mapFrom}
        toPole={mapTo}
        form={sheetForm}
        onChange={(f, v) => setSheetForm((p) => ({ ...p, [f]: v }))}
        onSubmit={handleSheetSubmit}
        onClose={() => setIsSheetOpen(false)}
        saving={saving}
        error={sheetError}
      />

      {/* Add Pole Modal */}
      {addPoleModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            onClick={cancelAddPole}
          />
          <div className="relative w-full max-w-sm overflow-hidden rounded-[28px] bg-white shadow-2xl dark:bg-zinc-900">
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-800 to-emerald-600 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
                    <i className="bx bx-map-pin text-lg text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-white">Add Pole</p>
                    <p className="mt-0.5 text-[11px] text-white/70">
                      {addPoleLat && addPoleLng
                        ? `${parseFloat(addPoleLat).toFixed(6)}, ${parseFloat(addPoleLng).toFixed(6)}`
                        : "No coordinates"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={cancelAddPole}
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/15 text-white hover:bg-white/25"
                >
                  <i className="bx bx-x text-lg" />
                </button>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleAddPole} className="p-6 space-y-4">
              <div>
                <label className={lCls}>
                  Pole Code <span className="text-red-400">*</span>
                </label>
                <input
                  autoFocus
                  value={addPoleCode}
                  onChange={(e) => setAddPoleCode(e.target.value.toUpperCase())}
                  placeholder="e.g. POLE-001"
                  className={iCls}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lCls}>Latitude</label>
                  <input
                    value={addPoleLat}
                    onChange={(e) => setAddPoleLat(e.target.value)}
                    className={iCls}
                    placeholder="14.5995"
                  />
                </div>
                <div>
                  <label className={lCls}>Longitude</label>
                  <input
                    value={addPoleLng}
                    onChange={(e) => setAddPoleLng(e.target.value)}
                    className={iCls}
                    placeholder="120.9842"
                  />
                </div>
              </div>
              {addPoleError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
                  {addPoleError}
                </div>
              )}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={cancelAddPole}
                  className={`flex-1 ${secondaryBtn}`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addPoleSaving}
                  className={`flex-1 ${primaryBtn} disabled:opacity-60 bg-green-600`}
                >
                  {addPoleSaving ? (
                    <span className="flex items-center justify-center gap-2">
                      <i className="bx bx-loader-alt animate-spin" /> Saving…
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <i className="bx bx-plus" /> Add Pole
                    </span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manual Add Modal */}
      <Modal
        open={isAddOpen}
        title="Add Span"
        subtitle={`Node: ${node?.full_label ?? node?.name ?? ""}`}
        icon="bx bx-git-branch"
        onClose={() => setIsAddOpen(false)}
        widthClass="max-w-xl"
      >
        <form onSubmit={handleManualAdd} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lCls}>From Pole</label>
              <div className="relative">
                <select
                  required
                  value={addForm.from_pole_id}
                  onChange={(e) =>
                    setAddForm((p) => ({
                      ...p,
                      from_pole_id: Number(e.target.value) || "",
                    }))
                  }
                  className={`${iCls} appearance-none pr-10 cursor-pointer`}
                >
                  <option value="">
                    {polesLoading
                      ? "Loading…"
                      : poles.length === 0
                        ? "No poles"
                        : "Select pole"}
                  </option>
                  {poles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {poleLabel(p)}
                    </option>
                  ))}
                </select>
                <i className="bx bx-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
            </div>
            <div>
              <label className={lCls}>To Pole</label>
              <div className="relative">
                <select
                  required
                  value={addForm.to_pole_id}
                  onChange={(e) =>
                    setAddForm((p) => ({
                      ...p,
                      to_pole_id: Number(e.target.value) || "",
                    }))
                  }
                  className={`${iCls} appearance-none pr-10 cursor-pointer`}
                >
                  <option value="">
                    {polesLoading
                      ? "Loading…"
                      : poles.length === 0
                        ? "No poles"
                        : "Select pole"}
                  </option>
                  {poles
                    .filter((p) => p.id !== addForm.from_pole_id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {poleLabel(p)}
                      </option>
                    ))}
                </select>
                <i className="bx bx-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
            </div>
            {polesError && (
              <p className="col-span-2 text-xs text-red-500">{polesError}</p>
            )}
          </div>
          <SpanFields
            form={addForm}
            onChange={(f, v) => setAddForm((p) => ({ ...p, [f]: v }))}
            actualCable={computeActual(
              addForm.strand_length,
              addForm.number_of_runs,
            )}
          />
          {addError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
              {addError}
            </div>
          )}
          <div className="flex justify-end gap-2 border-t border-slate-100 dark:border-zinc-700 pt-4">
            <button
              type="button"
              onClick={() => setIsAddOpen(false)}
              className={secondaryBtn}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className={`${primaryBtn} disabled:opacity-60`}
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <i className="bx bx-loader-alt animate-spin" /> Saving…
                </span>
              ) : (
                "Add Span"
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={isEditOpen}
        title="Edit Span"
        subtitle={`ID: ${selected?.span_code ?? `#${selected?.id}`}`}
        icon="bx bx-edit"
        onClose={() => setIsEditOpen(false)}
        widthClass="max-w-xl"
      >
        <form onSubmit={handleEdit} className="space-y-4">
          <SpanFields
            form={editForm}
            onChange={(f, v) => setEditForm((p) => ({ ...p, [f]: v }))}
            actualCable={computeActual(
              editForm.strand_length,
              editForm.number_of_runs,
            )}
          />
          <div>
            <label className={lCls}>Status</label>
            <div className="relative">
              <select
                value={editForm.status}
                onChange={(e) =>
                  setEditForm((p) => ({
                    ...p,
                    status: e.target.value as SpanStatus,
                  }))
                }
                className={`${iCls} appearance-none pr-10 cursor-pointer`}
              >
                <option value="">— unchanged —</option>
                <option value="pending">Pending</option>
                <option value="in_progress">Ongoing</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <i className="bx bx-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
          </div>
          {editError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
              {editError}
            </div>
          )}
          <div className="flex justify-end gap-2 border-t border-slate-100 dark:border-zinc-700 pt-4">
            <button
              type="button"
              onClick={() => setIsEditOpen(false)}
              className={secondaryBtn}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className={`${primaryBtn} disabled:opacity-60`}
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <i className="bx bx-loader-alt animate-spin" /> Saving…
                </span>
              ) : (
                "Save Changes"
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Modal */}
      <Modal
        open={isDelOpen}
        title="Delete Span?"
        subtitle="This cannot be undone."
        icon="bx bx-trash"
        onClose={() => setIsDelOpen(false)}
        widthClass="max-w-md"
        danger
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {(
                [
                  ["Span ID", selected?.span_code ?? "—"],
                  ["From", selected?.from_pole?.pole?.pole_code ?? "—"],
                  ["To", selected?.to_pole?.pole?.pole_code ?? "—"],
                  [
                    "Status",
                    statusCfg[selected?.status ?? "pending"]?.label ?? "—",
                  ],
                ] as [string, string][]
              ).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                    {k}
                  </dt>
                  <dd className="mt-1 font-medium text-slate-800 dark:text-zinc-100">
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          {delError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
              {delError}
            </div>
          )}
          <div className="flex gap-3">
            <button
              onClick={handleDelete}
              disabled={saving}
              className={`${dangerBtn} flex-1 disabled:opacity-60`}
            >
              {saving ? "Deleting…" : "Yes, Delete"}
            </button>
            <button
              onClick={() => setIsDelOpen(false)}
              className={`${secondaryBtn} flex-1`}
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
