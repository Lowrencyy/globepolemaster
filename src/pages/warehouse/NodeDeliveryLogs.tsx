import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API_BASE, getToken } from "../../lib/auth";

const API = `${API_BASE}/api/v1/skycable`;

type ReceiptItem = {
  id: number;
  item_type: string;
  quantity: number | string;
  unit: string;
};
type ReceiptNode = { id: number; name: string; full_label?: string };
type SpanRef = {
  id: number;
  span_id?: string | null;
  pole_span_code?: string | null;
  from_pole?: string | null;
  to_pole?: string | null;
};
type UserRef = {
  id: number;
  name: string;
  email?: string | null;
  role?: string | null;
};
type Receipt = {
  id: number;
  status: string;
  notes?: string | null;
  receipt_date?: string | null;
  proof_image?: string | null;
  received_by?: number | null;
  approved_by?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  items?: ReceiptItem[];
  node?: ReceiptNode | null;
  warehouse?: { id: number; name: string } | null;
  receivedBy?: UserRef | null;
  approvedBy?: UserRef | null;
  submittedBy?: UserRef | null;
  spans?: SpanRef[];
  teardown_log_id?: number | null;
};

type Tone = {
  label: string;
  color: string;
  bg: string;
  border: string;
  icon?: string;
};

const ITEM_META: Record<string, Tone> = {
  cable: { label: "Cable", color: "#059669", bg: "#ecfdf5", border: "#a7f3d0" },
  node: { label: "Node", color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" },
  amplifier: {
    label: "Amp",
    color: "#7c3aed",
    bg: "#f5f3ff",
    border: "#ddd6fe",
  },
  extender: {
    label: "Ext",
    color: "#0891b2",
    bg: "#ecfeff",
    border: "#a5f3fc",
  },
  tsc: { label: "TSC", color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
  psu: { label: "PSU", color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
  powersupply: {
    label: "PSU",
    color: "#dc2626",
    bg: "#fef2f2",
    border: "#fecaca",
  },
  power_supply: {
    label: "PSU",
    color: "#dc2626",
    bg: "#fef2f2",
    border: "#fecaca",
  },
  psu_case: {
    label: "PSU Case",
    color: "#475569",
    bg: "#f8fafc",
    border: "#e2e8f0",
  },
};

const STATUS_META: Record<string, Tone> = {
  approved: {
    label: "Approved",
    color: "#15803d",
    bg: "#f0fdf4",
    border: "#bbf7d0",
    icon: "bx-check-circle",
  },
  pending: {
    label: "Pending",
    color: "#b45309",
    bg: "#fffbeb",
    border: "#fde68a",
    icon: "bx-time-five",
  },
  arrived: {
    label: "Arrived",
    color: "#1d4ed8",
    bg: "#eff6ff",
    border: "#bfdbfe",
    icon: "bx-map-pin",
  },
  unloading: {
    label: "Unloading",
    color: "#7c3aed",
    bg: "#f5f3ff",
    border: "#ddd6fe",
    icon: "bx-transfer-alt",
  },
  rejected: {
    label: "Rejected",
    color: "#dc2626",
    bg: "#fef2f2",
    border: "#fecaca",
    icon: "bx-x-circle",
  },
};

function itemMeta(type: string) {
  return (
    ITEM_META[type.toLowerCase()] ?? {
      label: type,
      color: "#475569",
      bg: "#f8fafc",
      border: "#e2e8f0",
    }
  );
}
function statusMeta(s: string) {
  return (
    STATUS_META[s] ?? {
      label: s,
      color: "#475569",
      bg: "#f8fafc",
      border: "#e2e8f0",
      icon: "bx-circle",
    }
  );
}
function qty(v: number | string) {
  return Number(v) || 0;
}
function fmtDate(iso?: string | null) {
  return iso
    ? new Date(iso).toLocaleDateString("en-PH", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";
}
function fmtTime(iso?: string | null) {
  return iso
    ? new Date(iso).toLocaleTimeString("en-PH", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
    : "";
}
function timeAgo(iso?: string | null) {
  if (!iso) return "";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatQty(type: string, value: number) {
  return type === "cable" ? value.toFixed(1) : value.toLocaleString();
}

function StatusPill({
  status,
  active = true,
}: {
  status: string;
  active?: boolean;
}) {
  const sm = statusMeta(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${active ? "" : "opacity-60"}`}
      style={{ background: sm.bg, borderColor: sm.border, color: sm.color }}
    >
      <i className={`bx ${sm.icon} text-xs`} />
      {sm.label}
    </span>
  );
}

function PersonChip({
  label,
  user,
  tone,
  icon,
}: {
  label: string;
  user: UserRef;
  tone: string;
  icon: string;
}) {
  return (
    <div className="rounded-[1.35rem] border border-white/70 bg-white/80 p-3 shadow-sm ring-1 ring-slate-900/5 dark:border-zinc-700/70 dark:bg-zinc-900/80">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${tone}`}
        >
          <i className={`bx ${icon} text-lg`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-black uppercase tracking-[0.22em] text-slate-400">
            {label}
          </p>
          <p className="truncate text-sm font-black text-slate-900 dark:text-white">
            {user.name}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[9px] font-bold text-slate-400">
            <span className="font-mono">ID #{user.id}</span>
            {user.role && (
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 uppercase dark:bg-zinc-800">
                {user.role}
              </span>
            )}
            {user.email && (
              <span className="truncate font-mono opacity-80">
                {user.email}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  title,
  body,
  icon,
}: {
  title: string;
  body?: string;
  icon: string;
}) {
  return (
    <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white/70 px-6 py-14 text-center shadow-sm dark:border-zinc-700 dark:bg-zinc-900/70">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.35rem] bg-slate-100 dark:bg-zinc-800">
        <i
          className={`bx ${icon} text-3xl text-slate-300 dark:text-zinc-600`}
        />
      </div>
      <p className="mt-4 text-sm font-black text-slate-500 dark:text-zinc-400">
        {title}
      </p>
      {body && (
        <p className="mx-auto mt-1 max-w-sm text-xs text-slate-400">{body}</p>
      )}
    </div>
  );
}

function DetailDrawer({
  receipt,
  onClose,
  onSpanClick,
}: {
  receipt: Receipt;
  onClose: () => void;
  onSpanClick: (logId: number) => void;
}) {
  const sm = statusMeta(receipt.status);
  const items = (receipt.items ?? []).filter((i) => qty(i.quantity) > 0);
  const proofUrl = receipt.proof_image
    ? receipt.proof_image.startsWith("http")
      ? receipt.proof_image
      : `${API_BASE}/storage/${receipt.proof_image}`
    : null;
  const stamp =
    receipt.updated_at ?? receipt.receipt_date ?? receipt.created_at;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
        <div className="flex w-full max-w-xl max-h-[90vh] flex-col overflow-hidden rounded-[2rem] bg-[#fbfaf7] shadow-2xl dark:bg-zinc-950">
        <div className="relative overflow-hidden border-b border-black/5 px-5 py-5 dark:border-white/10">
          <div
            className="absolute -right-20 -top-24 h-44 w-44 rounded-full opacity-20 blur-3xl"
            style={{ background: sm.color }}
          />
          <div className="relative flex items-center gap-3">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-sm"
              style={{ background: sm.bg, color: sm.color }}
            >
              <i className={`bx ${sm.icon} text-2xl`} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-black tracking-tight text-slate-950 dark:text-white">
                  Delivery #{receipt.id}
                </h2>
                <StatusPill status={receipt.status} />
              </div>
              <p className="mt-0.5 text-xs font-bold text-slate-400">
                {fmtDate(stamp)}
                {fmtTime(stamp) && ` · ${fmtTime(stamp)}`}
              </p>
            </div>
            <button
              onClick={onClose}
              className="grid h-10 w-10 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-400 transition hover:-translate-y-0.5 hover:text-slate-800 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:text-white"
            >
              <i className="bx bx-x text-xl" />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <section className="grid gap-2">
            {receipt.submittedBy && (
              <PersonChip
                label="Submitted by"
                user={receipt.submittedBy}
                tone="bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300"
                icon="bx-upload"
              />
            )}
            {receipt.receivedBy && !receipt.approvedBy && (
              <PersonChip
                label="Received by"
                user={receipt.receivedBy}
                tone="bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300"
                icon="bx-package"
              />
            )}
            {receipt.approvedBy && (
              <PersonChip
                label="Approved by"
                user={receipt.approvedBy}
                tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300"
                icon="bx-user-check"
              />
            )}
            {!receipt.submittedBy &&
              !receipt.receivedBy &&
              !receipt.approvedBy &&
              receipt.received_by && (
                <div className="rounded-[1.35rem] border border-slate-200 bg-white/80 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900">
                  <p className="text-[9px] font-black uppercase tracking-[0.22em] text-slate-400">
                    Received by
                  </p>
                  <p className="mt-1 text-sm font-black text-slate-700 dark:text-zinc-200">
                    {typeof receipt.received_by === "object" && receipt.received_by !== null
                      ? ((receipt.received_by as { name?: string; id?: number }).name ?? `User #${(receipt.received_by as { id?: number }).id}`)
                      : `User #${receipt.received_by}`}
                  </p>
                </div>
              )}
          </section>

          {receipt.node && (
            <section className="rounded-[1.5rem] border border-blue-100 bg-blue-50/80 p-4 dark:border-blue-900/50 dark:bg-blue-950/20">
              <p className="text-[9px] font-black uppercase tracking-[0.24em] text-blue-500">
                Node
              </p>
              <p className="mt-1 text-base font-black text-blue-950 dark:text-blue-200">
                {receipt.node.full_label ?? receipt.node.name}
              </p>
            </section>
          )}

          {items.length > 0 && (
            <section>
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
                Delivered items
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {items.map((i) => {
                  const m = itemMeta(i.item_type);
                  const amount = qty(i.quantity);
                  return (
                    <div
                      key={i.id}
                      className="rounded-[1.25rem] border p-3 shadow-sm"
                      style={{ background: m.bg, borderColor: m.border }}
                    >
                      <p
                        className="text-[9px] font-black uppercase tracking-[0.2em]"
                        style={{ color: m.color }}
                      >
                        {m.label}
                      </p>
                      <p
                        className="mt-1 font-mono text-2xl font-black leading-none"
                        style={{ color: m.color }}
                      >
                        {formatQty(i.item_type, amount)}
                      </p>
                      <p
                        className="mt-1 text-[9px] font-bold uppercase opacity-70"
                        style={{ color: m.color }}
                      >
                        {i.unit ?? "pcs"}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {proofUrl && (
            <section>
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
                Proof of delivery
              </p>
              <a
                href={proofUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group block overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                <img
                  src={proofUrl}
                  alt="Proof"
                  className="max-h-80 w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                />
                <div className="flex items-center justify-between px-4 py-3 text-xs font-black text-slate-400">
                  <span className="inline-flex items-center gap-1.5">
                    <i className="bx bx-image" /> Tap to open full size
                  </span>
                  <i className="bx bx-link-external" />
                </div>
              </a>
            </section>
          )}

          {receipt.spans && receipt.spans.length > 0 && (
            <section>
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
                Pole spans · {receipt.spans.length}
              </p>
              <div className="space-y-2">
                {receipt.spans.map((sp) => (
                  <button
                    key={sp.id}
                    onClick={() =>
                      receipt.teardown_log_id &&
                      onSpanClick(receipt.teardown_log_id)
                    }
                    className="group flex w-full items-center gap-3 rounded-[1.25rem] border border-slate-200 bg-white/80 px-3 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-orange-200 dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-orange-50 text-orange-500 dark:bg-orange-950/40">
                      <i className="bx bx-map-pin" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-xs font-black text-slate-800 dark:text-zinc-100">
                        {sp.from_pole && sp.to_pole
                          ? `${sp.from_pole} → ${sp.to_pole}`
                          : (sp.pole_span_code ??
                            sp.span_id ??
                            `Span #${sp.id}`)}
                      </p>
                      {sp.pole_span_code && (
                        <p className="mt-0.5 text-[10px] font-bold text-slate-400">
                          {sp.pole_span_code}
                        </p>
                      )}
                    </div>
                    <i className="bx bx-chevron-right text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-orange-400" />
                  </button>
                ))}
              </div>
            </section>
          )}

          {receipt.teardown_log_id && (
            <button
              onClick={() => onSpanClick(receipt.teardown_log_id!)}
              className="flex w-full items-center gap-3 rounded-[1.35rem] bg-slate-950 px-4 py-4 text-left text-white shadow-lg shadow-slate-950/10 transition hover:-translate-y-0.5 dark:bg-white dark:text-slate-950"
            >
              <i className="bx bx-list-ul text-xl" />
              <span className="text-sm font-black">
                View Teardown Log #{receipt.teardown_log_id}
              </span>
              <i className="bx bx-chevron-right ml-auto text-xl" />
            </button>
          )}

          {receipt.notes && (
            <section className="rounded-[1.5rem] border border-slate-200 bg-white/70 p-4 dark:border-zinc-700 dark:bg-zinc-900">
              <p className="text-[9px] font-black uppercase tracking-[0.24em] text-slate-400">
                Notes
              </p>
              <p className="mt-1 text-sm italic leading-relaxed text-slate-600 dark:text-zinc-300">
                {receipt.notes}
              </p>
            </section>
          )}
        </div>
        </div>
      </div>
    </>
  );
}

export default function NodeDeliveryLogs() {
  const { warehouseId, nodeId } = useParams<{
    warehouseId: string;
    nodeId: string;
  }>();
  const navigate = useNavigate();

  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [nodeName, setNodeName] = useState("");
  const [warehouseName, setWarehouseName] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selected, setSelected] = useState<Receipt | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!warehouseId) return;
    setLoading(true);
    setError("");

    fetch(`${API}/warehouses/${warehouseId}/receipts?per_page=200`, {
      headers: {
        Authorization: `Bearer ${getToken()}`,
        },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then((d) => {
        const all: Receipt[] = Array.isArray(d) ? d : (d.data ?? []);
        const forNode = nodeId
          ? all.filter((r) => r.node?.id === Number(nodeId))
          : all;
        setReceipts(forNode);
        const first = forNode[0];
        if (first?.node) setNodeName(first.node.full_label ?? first.node.name);
        if (first?.warehouse) setWarehouseName(first.warehouse.name);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [warehouseId, nodeId]);

  function openDetail(r: Receipt) {
    setDetailLoading(true);
    fetch(`${API}/warehouse-receipts/${r.id}`, {
      headers: {
        Authorization: `Bearer ${getToken()}`,
        },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((full) => setSelected(full ?? r))
      .catch(() => setSelected(r))
      .finally(() => setDetailLoading(false));
  }

  function handleSpanClick(logId: number) {
    setSelected(null);
    navigate(`/reports/teardown-logs/${logId}`);
  }

  const filtered =
    filterStatus === "all"
      ? receipts
      : receipts.filter((r) => r.status === filterStatus);
  const allStatuses = [...new Set(receipts.map((r) => r.status))];

  const totals: Record<string, number> = {};
  receipts.forEach((r) =>
    (r.items ?? []).forEach((i) => {
      totals[i.item_type.toLowerCase()] =
        (totals[i.item_type.toLowerCase()] ?? 0) + qty(i.quantity);
    }),
  );

  const approvedTotals: Record<string, number> = {};
  receipts
    .filter((r) => r.status === "approved")
    .forEach((r) =>
      (r.items ?? []).forEach((i) => {
        approvedTotals[i.item_type.toLowerCase()] =
          (approvedTotals[i.item_type.toLowerCase()] ?? 0) + qty(i.quantity);
      }),
    );

  const approvedCount = receipts.filter((r) => r.status === "approved").length;
  const lastUpdated = receipts
    .map((r) => r.updated_at ?? r.created_at)
    .filter(Boolean)
    .sort()
    .at(-1);

  return (
    <div className="min-h-screen bg-[#f7f3ec] pb-20 text-slate-950 dark:bg-zinc-950 dark:text-white">
      {(selected || detailLoading) &&
        (detailLoading ? (
          <>
            <div className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-sm" />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="flex w-full max-w-xl flex-col items-center justify-center rounded-[2rem] bg-[#fbfaf7] py-20 shadow-2xl dark:bg-zinc-950">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                <p className="mt-3 text-sm font-black text-slate-400">
                  Loading delivery details…
                </p>
              </div>
            </div>
          </>
        ) : selected ? (
          <DetailDrawer
            receipt={selected}
            onClose={() => setSelected(null)}
            onSpanClick={handleSpanClick}
          />
        ) : null)}

      <header className="relative overflow-hidden border-b border-black/5 bg-[#efe7d7] dark:border-white/10 dark:bg-zinc-900">
        <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-emerald-300/25 blur-3xl" />
        <div className="absolute right-0 top-0 h-full w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(15,23,42,0.12),transparent_45%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.16),transparent_45%)]" />
        <div className="relative mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-7">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-black/10 bg-white/70 text-slate-600 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:bg-white dark:border-white/10 dark:bg-white/10 dark:text-zinc-200"
            >
              <i className="bx bx-chevron-left text-2xl" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500 dark:text-zinc-400">
                {warehouseName || `Warehouse #${warehouseId}`} · Node delivery
                ledger
              </p>
              <h1 className="mt-1 truncate text-2xl font-black tracking-[-0.04em] text-slate-950 dark:text-white sm:text-4xl">
                {nodeName || `Node #${nodeId}`}
              </h1>
            </div>
            <div className="hidden rounded-2xl border border-black/10 bg-white/70 px-4 py-3 text-right shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/10 sm:block">
              <p className="text-2xl font-black leading-none">
                {receipts.length}
              </p>
              <p className="mt-1 text-[9px] font-black uppercase tracking-[0.22em] text-slate-500">
                deliveries
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[1.5rem] border border-black/10 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/10">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
                Approved
              </p>
              <p className="mt-2 text-3xl font-black tracking-tight">
                {approvedCount}
                <span className="text-base text-slate-400">
                  /{receipts.length}
                </span>
              </p>
            </div>
            <div className="rounded-[1.5rem] border border-black/10 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/10">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
                Statuses
              </p>
              <p className="mt-2 text-3xl font-black tracking-tight">
                {allStatuses.length || 0}
              </p>
            </div>
            <div className="rounded-[1.5rem] border border-black/10 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/10">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
                Latest activity
              </p>
              <p className="mt-2 truncate text-lg font-black tracking-tight">
                {lastUpdated ? timeAgo(lastUpdated) : "—"}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 pt-5 sm:px-6">
        {Object.keys(totals).length > 0 && (
          <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white/80 shadow-sm ring-1 ring-slate-900/5 backdrop-blur dark:border-white/10 dark:bg-zinc-900/80">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-zinc-800">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">
                  Grand total
                </p>
                <h2 className="mt-1 text-lg font-black tracking-tight text-slate-900 dark:text-white">
                  All deliveries combined
                </h2>
              </div>
              {approvedCount > 0 && (
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                  {approvedCount} approved
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6">
              {Object.entries(totals).map(([type, total]) => {
                const m = itemMeta(type);
                const approvedQty = approvedTotals[type] ?? 0;
                return (
                  <div
                    key={type}
                    className="relative overflow-hidden rounded-[1.35rem] border p-4"
                    style={{ background: m.bg, borderColor: m.border }}
                  >
                    <div
                      className="absolute -right-8 -top-8 h-20 w-20 rounded-full opacity-20"
                      style={{ background: m.color }}
                    />
                    <p
                      className="relative text-[9px] font-black uppercase tracking-[0.22em]"
                      style={{ color: m.color }}
                    >
                      {m.label}
                    </p>
                    <p
                      className="relative mt-2 font-mono text-3xl font-black leading-none"
                      style={{ color: m.color }}
                    >
                      {formatQty(type, total)}
                    </p>
                    <p
                      className="relative mt-1 text-[9px] font-bold uppercase opacity-70"
                      style={{ color: m.color }}
                    >
                      {type === "cable" ? "meters" : "items"}
                    </p>
                    {approvedQty > 0 && approvedQty < total && (
                      <p className="relative mt-2 text-[9px] font-black text-emerald-600">
                        {formatQty(type, approvedQty)} approved
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {allStatuses.length > 1 && (
          <div className="sticky top-0 z-10 -mx-4 border-y border-black/5 bg-[#f7f3ec]/90 px-4 py-3 backdrop-blur dark:border-white/10 dark:bg-zinc-950/90 sm:top-0 sm:mx-0 sm:rounded-2xl sm:border">
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                onClick={() => setFilterStatus("all")}
                className={`shrink-0 rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.12em] transition ${filterStatus === "all" ? "border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950" : "border-slate-200 bg-white/70 text-slate-500 hover:bg-white dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"}`}
              >
                All · {receipts.length}
              </button>
              {allStatuses.map((s) => {
                const count = receipts.filter((r) => r.status === s).length;
                const m = statusMeta(s);
                return (
                  <button
                    key={s}
                    onClick={() => setFilterStatus(s)}
                    className="shrink-0 rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.12em] transition hover:-translate-y-0.5"
                    style={{
                      background:
                        filterStatus === s ? m.bg : "rgba(255,255,255,.72)",
                      borderColor: filterStatus === s ? m.border : "#e2e8f0",
                      color: m.color,
                    }}
                  >
                    {m.label} · {count}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {loading ? (
          <div className="grid place-items-center py-20">
            <div className="text-center">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
              <p className="mt-3 text-sm font-black text-slate-400">
                Loading delivery logs…
              </p>
            </div>
          </div>
        ) : error ? (
          <div className="rounded-[1.5rem] border border-rose-200 bg-rose-50 p-5 text-rose-700 dark:border-rose-800/50 dark:bg-rose-950/30 dark:text-rose-300">
            <p className="font-black">
              <i className="bx bx-error mr-1" /> Failed to load
            </p>
            <p className="mt-1 text-xs font-bold opacity-80">{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="bx-package"
            title="No delivery logs found"
            body="Try another status filter or check if this node has receipts."
          />
        ) : (
          <section className="grid gap-3 lg:grid-cols-2">
            {filtered.map((r) => {
              const sm = statusMeta(r.status);
              const stamp = r.updated_at ?? r.receipt_date ?? r.created_at;
              const items = (r.items ?? []).filter((i) => qty(i.quantity) > 0);
              return (
                <button
                  key={r.id}
                  onClick={() => openDetail(r)}
                  className="group overflow-hidden rounded-[1.75rem] border border-black/5 bg-white/85 text-left shadow-sm ring-1 ring-slate-900/5 transition duration-200 hover:-translate-y-1 hover:shadow-xl dark:border-white/10 dark:bg-zinc-900/85"
                >
                  <div className="flex items-start gap-4 p-4">
                    <div
                      className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl"
                      style={{ background: sm.bg, color: sm.color }}
                    >
                      <i className={`bx ${sm.icon} text-2xl`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-black tracking-tight text-slate-950 dark:text-white">
                          Delivery #{r.id}
                        </h3>
                        <StatusPill status={r.status} />
                      </div>
                      <p className="mt-1 text-[11px] font-bold text-slate-400">
                        {timeAgo(stamp) && `${timeAgo(stamp)} · `}
                        {fmtDate(stamp)}
                        {fmtTime(stamp) && ` · ${fmtTime(stamp)}`}
                      </p>
                    </div>
                    <i className="bx bx-chevron-right mt-2 text-2xl text-slate-300 transition group-hover:translate-x-1 group-hover:text-slate-500" />
                  </div>

                  <div className="px-4 pb-4">
                    {items.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {items.slice(0, 5).map((i) => {
                          const m = itemMeta(i.item_type);
                          return (
                            <span
                              key={i.id}
                              className="rounded-full border px-2.5 py-1 text-[10px] font-black"
                              style={{
                                background: m.bg,
                                borderColor: m.border,
                                color: m.color,
                              }}
                            >
                              {m.label} ·{" "}
                              {formatQty(i.item_type, qty(i.quantity))}{" "}
                              {i.unit ?? "pcs"}
                            </span>
                          );
                        })}
                        {items.length > 5 && (
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-500 dark:bg-zinc-800">
                            +{items.length - 5} more
                          </span>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs font-bold italic text-slate-400">
                        No items recorded
                      </p>
                    )}

                    {(r.submittedBy ?? r.approvedBy ?? r.receivedBy) && (
                      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-zinc-800">
                        {r.submittedBy && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-600 dark:bg-blue-950/40">
                            <i className="bx bx-upload" />
                            {r.submittedBy.name}
                          </span>
                        )}
                        {r.approvedBy && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                            <i className="bx bx-user-check" />
                            {r.approvedBy.name}
                          </span>
                        )}
                        {!r.approvedBy && r.receivedBy && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-1 text-[10px] font-black text-violet-600 dark:bg-violet-950/40">
                            <i className="bx bx-package" />
                            {r.receivedBy.name}
                          </span>
                        )}
                      </div>
                    )}
                    {r.notes && (
                      <p className="mt-3 truncate text-[11px] italic text-slate-400">
                        “{r.notes}”
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </section>
        )}
      </main>
    </div>
  );
}
