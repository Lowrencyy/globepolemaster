import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getToken, SKYCABLE_API, isWarehouseIncharge, canAccessWarehouse } from "../../lib/auth";

// ── Types ─────────────────────────────────────────────────────────────────────

// Matches GET /skycable/teardowns response (same fields as daily-report uses)
interface CompletedSpan {
  id: number;
  status: string;
  actual_cable: number | null;
  expected_cable: number | null;
  nodes_collected: number;
  amplifiers_collected: number;
  extenders_collected: number;
  tsc_collected: number;
  powersupply_collected: number;
  ps_housing_collected: number;
  start_time: string;
  end_time: string | null;
  team?: { id: number; name: string } | null;
  span?: {
    span_code?: string | null;
    node?: { id: number; name: string } | null;
    fromPole?: { pole?: { pole_code: string } | null } | null;
    toPole?: { pole?: { pole_code: string } | null } | null;
  } | null;
}

interface DeliveryRecord {
  id: number;
  date: string;
  status: "pending" | "approved" | "rejected";
  total_cable: number;
  total_node: number;
  total_amplifier: number;
  total_extender: number;
  total_tsc: number;
  total_psu: number;
  total_psu_case: number;
  span_count: number;
  team?: { id: number; name: string } | null;
  approved_by?: { name: string } | null;
  approved_at?: string | null;
  notes?: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function authHeaders() {
  return {
    Authorization: `Bearer ${getToken()}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "1",
  };
}


function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-PH", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}

function pick(val1: number | null | undefined, val2: number | null | undefined): number {
  return val1 ?? val2 ?? 0;
}

function getSpanTotals(s: CompletedSpan) {
  return {
    cable:     s.actual_cable          ?? 0,
    node:      s.nodes_collected       ?? 0,
    amplifier: s.amplifiers_collected  ?? 0,
    extender:  s.extenders_collected   ?? 0,
    tsc:       s.tsc_collected         ?? 0,
    psu:       s.powersupply_collected ?? 0,
    psuCase:   s.ps_housing_collected  ?? 0,
  };
}

// ── Stat Card ──────────────────────────────────────────────────────────────────
function StatCard({ label, value, unit, icon, color }: {
  label: string; value: number; unit?: string; icon: string; color: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 dark:bg-zinc-900 dark:ring-zinc-800">
      <div className={`h-1`} style={{ background: color }} />
      <div className="flex items-start justify-between p-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-zinc-500">{label}</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            {value > 0 ? (unit ? `${value}${unit}` : value) : <span className="text-slate-300 dark:text-zinc-600">—</span>}
          </p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: color + "18" }}>
          <i className={`${icon} text-xl`} style={{ color }} />
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function DailyTeardownDelivery() {
  const today = new Date().toLocaleDateString("en-CA");
  const [selectedDate, setSelectedDate] = useState(today);
  const [spans, setSpans] = useState<CompletedSpan[]>([]);
  const [deliveryRecords, setDeliveryRecords] = useState<DeliveryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [approving, setApproving] = useState<number | null>(null);
  const [submitNote, setSubmitNote] = useState("");
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const isWH = isWarehouseIncharge() || canAccessWarehouse();

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    loadData();
  }, [selectedDate]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [spansRes, deliveriesRes] = await Promise.all([
        // Use the teardown-logs endpoint — same source as daily-report
        fetch(`${SKYCABLE_API}/teardowns?per_page=500`, { headers: authHeaders() }),
        fetch(`${SKYCABLE_API}/deliveries?date=${selectedDate}`, { headers: authHeaders() }).catch(() => null),
      ]);

      if (spansRes.ok) {
        const data = await spansRes.json();
        const all: CompletedSpan[] = Array.isArray(data) ? data : (data?.data ?? []);
        // Filter to selected date using end_time (PHT)
        const filtered = all.filter(s => {
          const ts = s.end_time || s.start_time;
          if (!ts) return false;
          const pht = new Date(new Date(ts).getTime() + 8 * 3600 * 1000);
          return pht.toISOString().slice(0, 10) === selectedDate;
        });
        setSpans(filtered);
      }

      if (deliveriesRes?.ok) {
        const d = await deliveriesRes.json();
        setDeliveryRecords(Array.isArray(d) ? d : (d?.data ?? []));
      }
    } catch (e) {
      setError("Failed to load data. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  // ── Aggregate totals from today's completed spans ──────────────────────────
  const totals = useMemo(() => {
    return spans.reduce(
      (acc, s) => {
        const t = getSpanTotals(s);
        acc.cable += t.cable;
        acc.node += t.node;
        acc.amplifier += t.amplifier;
        acc.extender += t.extender;
        acc.tsc += t.tsc;
        acc.psu += t.psu;
        acc.psuCase += t.psuCase;
        return acc;
      },
      { cable: 0, node: 0, amplifier: 0, extender: 0, tsc: 0, psu: 0, psuCase: 0 }
    );
  }, [spans]);

  // ── Submit delivery to warehouse ───────────────────────────────────────────
  async function handleSubmitDelivery() {
    if (!spans.length) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        date: selectedDate,
        teardown_log_ids: spans.map(s => s.id),
        total_cable: totals.cable,
        total_node: totals.node,
        total_amplifier: totals.amplifier,
        total_extender: totals.extender,
        total_tsc: totals.tsc,
        total_psu: totals.psu,
        total_psu_case: totals.psuCase,
        notes: submitNote || null,
      };
      const res = await fetch(`${SKYCABLE_API}/deliveries`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Failed to submit delivery");
      setSuccessMsg("Delivery submitted! Waiting for warehouse approval.");
      setShowSubmitForm(false);
      setSubmitNote("");
      await loadData();
    } catch (e: any) {
      setError(e.message || "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Warehouse approve ──────────────────────────────────────────────────────
  async function handleApprove(deliveryId: number) {
    setApproving(deliveryId);
    setError(null);
    try {
      const res = await fetch(`${SKYCABLE_API}/deliveries/${deliveryId}/approve`, {
        method: "POST",
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Approval failed");
      setSuccessMsg("Delivery approved and recorded in warehouse!");
      await loadData();
    } catch (e: any) {
      setError(e.message || "Approval failed");
    } finally {
      setApproving(null);
    }
  }

  const todayDelivery = deliveryRecords.find(d => d.date === selectedDate);
  const isAlreadySubmitted = !!todayDelivery;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <Link to="/dashboard" className="hover:text-emerald-600 transition">Dashboard</Link>
            <i className="bx bx-chevron-right" />
            <span className="font-semibold text-slate-600 dark:text-slate-300">Daily Teardown Delivery</span>
          </div>
          <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
            Daily Teardown Delivery
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Collected items from completed spans — submitted to warehouse for approval
          </p>
        </div>

        {/* Date picker */}
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={selectedDate}
            max={today}
            onChange={e => setSelectedDate(e.target.value)}
            className="h-10 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
          />
          <button
            onClick={() => setSelectedDate(today)}
            className={`h-10 rounded-2xl px-4 text-xs font-bold transition ${selectedDate === today ? "bg-emerald-600 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"}`}
          >
            Today
          </button>
        </div>
      </div>

      {/* Date label */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 shadow-sm ring-1 ring-slate-200/70 dark:bg-zinc-900 dark:ring-zinc-800">
          <i className="bx bx-calendar text-emerald-600 text-lg" />
          <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{fmtDate(selectedDate)}</span>
        </div>
        {isAlreadySubmitted && (
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
            todayDelivery?.status === "approved"
              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
              : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
          }`}>
            <span className={`h-2 w-2 rounded-full ${todayDelivery?.status === "approved" ? "bg-emerald-500" : "bg-amber-400"}`} />
            {todayDelivery?.status === "approved" ? "Approved by Warehouse" : "Pending Warehouse Approval"}
          </span>
        )}
      </div>

      {/* Alerts */}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
          <i className="bx bx-error-circle mr-2" />{error}
        </div>
      )}
      {successMsg && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400">
          <i className="bx bx-check-circle mr-2" />{successMsg}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <i className="bx bx-loader-alt animate-spin text-3xl text-emerald-600" />
        </div>
      ) : (
        <>
          {/* ── Totals Grid ─────────────────────────────────────────────── */}
          <div>
            <p className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-zinc-500">
              Collected Items — {spans.length} span{spans.length !== 1 ? "s" : ""} completed
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
              <StatCard label="Actual Cable" value={totals.cable} unit="m" icon="bx bx-cable-car" color="#059669" />
              <StatCard label="Node" value={totals.node} icon="bx bx-server" color="#0b6cff" />
              <StatCard label="Amplifier" value={totals.amplifier} icon="bx bx-broadcast" color="#8b5cf6" />
              <StatCard label="Extender" value={totals.extender} icon="bx bx-wifi" color="#10b981" />
              <StatCard label="TSC" value={totals.tsc} icon="bx bx-chip" color="#f59e0b" />
              <StatCard label="Power Supply" value={totals.psu} icon="bx bx-plug" color="#ef4444" />
              <StatCard label="PSU Case" value={totals.psuCase} icon="bx bx-box" color="#64748b" />
            </div>
          </div>

          {/* ── Submit / Approve Actions ─────────────────────────────────── */}
          {spans.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              {!isAlreadySubmitted && (
                <button
                  onClick={() => setShowSubmitForm(v => !v)}
                  className="inline-flex h-10 items-center gap-2 rounded-2xl bg-emerald-600 px-5 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-700 transition"
                >
                  <i className="bx bx-send text-base" />
                  Submit to Warehouse
                </button>
              )}
              {isAlreadySubmitted && todayDelivery?.status === "pending" && isWH && (
                <button
                  onClick={() => handleApprove(todayDelivery.id)}
                  disabled={approving === todayDelivery.id}
                  className="inline-flex h-10 items-center gap-2 rounded-2xl bg-blue-600 px-5 text-sm font-bold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition disabled:opacity-60"
                >
                  {approving === todayDelivery.id
                    ? <><i className="bx bx-loader-alt animate-spin" /> Approving…</>
                    : <><i className="bx bx-check-shield text-base" /> Approve & Receive</>}
                </button>
              )}
            </div>
          )}

          {/* Submit note form */}
          {showSubmitForm && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
              <p className="mb-3 text-sm font-black text-slate-700 dark:text-slate-300">Add a note (optional)</p>
              <textarea
                value={submitNote}
                onChange={e => setSubmitNote(e.target.value)}
                placeholder="e.g. All items collected from Marikina Demo spans…"
                rows={3}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none focus:border-emerald-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
              <div className="mt-3 flex gap-2">
                <button
                  onClick={handleSubmitDelivery}
                  disabled={submitting}
                  className="h-10 rounded-2xl bg-emerald-600 px-5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60 transition"
                >
                  {submitting ? <><i className="bx bx-loader-alt animate-spin mr-1" />Submitting…</> : "Confirm Submit"}
                </button>
                <button onClick={() => setShowSubmitForm(false)} className="h-10 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 transition">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── Spans breakdown table ─────────────────────────────────────── */}
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 dark:bg-zinc-900 dark:ring-zinc-800">
            <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-3 dark:border-zinc-800 dark:from-zinc-900">
              <p className="text-xs font-black text-slate-700 dark:text-slate-300">
                Span Breakdown — {spans.length} completed span{spans.length !== 1 ? "s" : ""}
              </p>
            </div>
            {spans.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400 dark:text-zinc-600">
                <i className="bx bx-git-branch text-4xl" />
                <p className="text-sm font-semibold">No completed spans for {fmtDate(selectedDate)}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 dark:border-zinc-800 dark:bg-zinc-900/60">
                      {["#","Span ID","From → To","Node","Cable (m)","Node","Amp","Ext","TSC","PSU","PSU Case"].map(h => (
                        <th key={h} className="whitespace-nowrap px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {spans.map((s, idx) => {
                      const t = getSpanTotals(s);
                      const dash = <span className="text-slate-300 dark:text-zinc-600">—</span>;
                      return (
                        <tr key={s.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 dark:border-zinc-800/60 dark:hover:bg-zinc-800/40">
                          <td className="px-3 py-3 text-[11px] font-bold tabular-nums text-slate-300 dark:text-zinc-600">{idx + 1}</td>
                          <td className="px-3 py-3 font-mono text-[11px] font-semibold text-slate-500">{s.span?.span_code ?? `#${s.id}`}</td>
                          <td className="px-3 py-3 text-xs font-semibold text-slate-600 dark:text-zinc-300">
                            <span className="font-mono text-blue-600">{s.span?.fromPole?.pole?.pole_code ?? "—"}</span>
                            <span className="mx-1 text-slate-300">→</span>
                            <span className="font-mono text-orange-600">{s.span?.toPole?.pole?.pole_code ?? "—"}</span>
                          </td>
                          <td className="px-3 py-3 text-xs text-slate-500">{s.span?.node?.name ?? dash}</td>
                          <td className="px-3 py-3 text-xs font-bold tabular-nums text-emerald-600">{t.cable > 0 ? t.cable : dash}</td>
                          <td className="px-3 py-3 text-xs tabular-nums text-slate-600 dark:text-zinc-300">{t.node > 0 ? t.node : dash}</td>
                          <td className="px-3 py-3 text-xs tabular-nums text-slate-600 dark:text-zinc-300">{t.amplifier > 0 ? t.amplifier : dash}</td>
                          <td className="px-3 py-3 text-xs tabular-nums text-slate-600 dark:text-zinc-300">{t.extender > 0 ? t.extender : dash}</td>
                          <td className="px-3 py-3 text-xs tabular-nums text-slate-600 dark:text-zinc-300">{t.tsc > 0 ? t.tsc : dash}</td>
                          <td className="px-3 py-3 text-xs tabular-nums text-slate-600 dark:text-zinc-300">{t.psu > 0 ? t.psu : dash}</td>
                          <td className="px-3 py-3 text-xs tabular-nums text-slate-600 dark:text-zinc-300">{t.psuCase > 0 ? t.psuCase : dash}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {/* Totals footer */}
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50 font-black dark:border-zinc-700 dark:bg-zinc-900/60">
                      <td colSpan={4} className="px-3 py-3 text-xs font-black uppercase tracking-wider text-slate-500">TOTAL</td>
                      <td className="px-3 py-3 text-sm font-black tabular-nums text-emerald-700">{totals.cable > 0 ? totals.cable : "—"}</td>
                      <td className="px-3 py-3 text-sm font-black tabular-nums text-blue-700">{totals.node > 0 ? totals.node : "—"}</td>
                      <td className="px-3 py-3 text-sm font-black tabular-nums text-violet-700">{totals.amplifier > 0 ? totals.amplifier : "—"}</td>
                      <td className="px-3 py-3 text-sm font-black tabular-nums text-emerald-700">{totals.extender > 0 ? totals.extender : "—"}</td>
                      <td className="px-3 py-3 text-sm font-black tabular-nums text-amber-700">{totals.tsc > 0 ? totals.tsc : "—"}</td>
                      <td className="px-3 py-3 text-sm font-black tabular-nums text-red-700">{totals.psu > 0 ? totals.psu : "—"}</td>
                      <td className="px-3 py-3 text-sm font-black tabular-nums text-slate-700">{totals.psuCase > 0 ? totals.psuCase : "—"}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* ── Past delivery records ─────────────────────────────────────── */}
          {deliveryRecords.length > 0 && (
            <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 dark:bg-zinc-900 dark:ring-zinc-800">
              <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-3 dark:border-zinc-800 dark:from-zinc-900">
                <p className="text-xs font-black text-slate-700 dark:text-slate-300">Delivery Records</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 dark:border-zinc-800 dark:bg-zinc-900/60">
                      {["Date","Spans","Cable","Node","Amp","Ext","TSC","PSU","PSU Case","Status","Action"].map(h => (
                        <th key={h} className="whitespace-nowrap px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {deliveryRecords.map(dr => (
                      <tr key={dr.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 dark:border-zinc-800/60 dark:hover:bg-zinc-800/40">
                        <td className="px-3 py-3 text-xs font-semibold text-slate-700 dark:text-zinc-300">{fmtDate(dr.date)}</td>
                        <td className="px-3 py-3 text-xs tabular-nums text-slate-600">{dr.span_count}</td>
                        <td className="px-3 py-3 text-xs font-bold tabular-nums text-emerald-600">{dr.total_cable}m</td>
                        <td className="px-3 py-3 text-xs tabular-nums text-slate-600">{dr.total_node || "—"}</td>
                        <td className="px-3 py-3 text-xs tabular-nums text-slate-600">{dr.total_amplifier || "—"}</td>
                        <td className="px-3 py-3 text-xs tabular-nums text-slate-600">{dr.total_extender || "—"}</td>
                        <td className="px-3 py-3 text-xs tabular-nums text-slate-600">{dr.total_tsc || "—"}</td>
                        <td className="px-3 py-3 text-xs tabular-nums text-slate-600">{dr.total_psu || "—"}</td>
                        <td className="px-3 py-3 text-xs tabular-nums text-slate-600">{dr.total_psu_case || "—"}</td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                            dr.status === "approved"
                              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                              : dr.status === "rejected"
                              ? "bg-red-50 text-red-700 ring-1 ring-red-200"
                              : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                          }`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${dr.status === "approved" ? "bg-emerald-500" : dr.status === "rejected" ? "bg-red-500" : "bg-amber-400"}`} />
                            {dr.status === "approved" ? "Approved" : dr.status === "rejected" ? "Rejected" : "Pending"}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          {dr.status === "pending" && isWH && (
                            <button
                              onClick={() => handleApprove(dr.id)}
                              disabled={approving === dr.id}
                              className="h-7 rounded-xl bg-blue-600 px-3 text-[11px] font-bold text-white hover:bg-blue-700 disabled:opacity-60 transition"
                            >
                              {approving === dr.id ? "…" : "Approve"}
                            </button>
                          )}
                          {dr.status === "approved" && dr.approved_by && (
                            <span className="text-[11px] text-slate-400">by {dr.approved_by.name}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
