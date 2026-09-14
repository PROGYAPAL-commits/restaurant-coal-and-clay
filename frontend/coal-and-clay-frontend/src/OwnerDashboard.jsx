import { useState, useEffect } from 'react';
import {
  Flame, IndianRupee, TrendingUp, TrendingDown, Users, Clock, ChefHat,
  Receipt, LayoutGrid, BarChart3, UserCheck, Circle
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell,
} from 'recharts';
import { api } from './lib/api';
import { getSocket } from './lib/socket';

const RANGE_LABELS = { today: 'Today', week: 'This week', month: 'This month' };

function fmtINR(n) {
  return `₹${(n || 0).toLocaleString('en-IN')}`;
}

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// 24h hour number -> "8 PM" / "12 AM" style label
function formatHour(hour) {
  const h = ((hour % 24) + 24) % 24;
  const period = h < 12 ? 'AM' : 'PM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display} ${period}`;
}

// backend DiningTable -> the { id, seats, status, party, since, time } shape this tab renders
function normalizeTable(t) {
  return {
    id: t.label,
    seats: t.seats,
    status: t.status,
    party: t.party,
    since: t.seatedAt ? Math.max(0, Math.round((Date.now() - new Date(t.seatedAt).getTime()) / 60000)) : 0,
    time: t.reservedFor ? new Date(t.reservedFor).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : null,
  };
}

// backend Staff -> { id, name, role, shift, onDuty, orders }
function normalizeStaff(s) {
  return { id: s.id, name: s.name, role: s.role, shift: s.shift, onDuty: s.onDuty, orders: s.ordersHandled };
}

// backend Order -> the recent-orders row shape this tab renders
function normalizeOrderRow(o) {
  return {
    id: o.id,
    table: o.table ? o.table.label : 'Takeaway',
    items: Array.isArray(o.items) ? o.items.reduce((sum, i) => sum + i.qty, 0) : 0,
    amount: o.total,
    payment: o.paymentStatus,
    time: timeAgo(o.createdAt),
  };
}

function Delta({ current, previous }) {
  const pct = (((current - previous) / previous) * 100).toFixed(1);
  const up = current >= previous;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11.5, fontWeight: 600,
      color: up ? '#A9C98B' : '#E08D7C',
    }}>
      {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {Math.abs(pct)}%
    </span>
  );
}

function KpiCard({ icon: Icon, label, value, current, previous, accent }) {
  return (
    <div style={{
      background: '#262320', border: '1px solid #3A352E', borderRadius: 14, padding: 18,
      display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{
          width: 32, height: 32, borderRadius: 9, background: `${accent}22`, color: accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={16} />
        </div>
        {previous !== undefined && <Delta current={current} previous={previous} />}
      </div>
      <div>
        <div className="mono" style={{ fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 11.5, color: '#A79E8E', marginTop: 6 }}>{label}</div>
      </div>
    </div>
  );
}

export default function OwnerDashboard() {
  const [dayRange, setDayRange] = useState('today');
  const [tab, setTab] = useState('overview');
  const [tables, setTables] = useState([]);
  const [staff, setStaff] = useState([]);
  const [sales, setSales] = useState({ orders: 0, sales: 0, profit: 0, avgOrderValue: 0, trend: [] });
  const [peak, setPeak] = useState({ hourly: [], peakHour: 12, peakOrders: 0 });
  const [recentOrders, setRecentOrders] = useState([]);

  const data = { label: RANGE_LABELS[dayRange], ...sales };
  const avgOrderValue = sales.avgOrderValue;

  const occupied = tables.filter(t => t.status === 'occupied').length;
  // Only chart hours that actually had orders, so the bar chart isn't 24 empty bars.
  const peakChartData = peak.hourly
    .map(h => ({ hour: formatHour(h.hour), orders: h.orders, hourNum: h.hour }))
    .filter(h => h.orders > 0);
  const peakSlot = { hour: formatHour(peak.peakHour) };

  const loadAnalytics = () => {
    api.getSalesAnalytics(dayRange)
      .then(res => setSales({ ...res, trend: res.trend.map(p => ({ t: p.label, sales: p.value })) }))
      .catch(() => {});
    api.getPeakHours(dayRange).then(setPeak).catch(() => {});
  };

  const loadOrders = () => {
    api.getOrders().then(list => setRecentOrders(list.slice(0, 12).map(normalizeOrderRow))).catch(() => {});
  };

  // Refetch analytics whenever the selected range changes
  useEffect(() => {
    loadAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayRange]);

  // Initial load for everything else
  useEffect(() => {
    api.getTables().then(list => setTables(list.map(normalizeTable))).catch(() => {});
    api.getStaff().then(list => setStaff(list.map(normalizeStaff))).catch(() => {});
    loadOrders();
  }, []);

  // Live updates over Socket.IO
  useEffect(() => {
    const socket = getSocket();
    const onTableUpdated = (table) => {
      setTables(prev => prev.map(t => (t.id === table.label ? normalizeTable(table) : t)));
    };
    const onOrderChange = () => {
      loadAnalytics();
      loadOrders();
    };
    socket.on('table:updated', onTableUpdated);
    socket.on('order:new', onOrderChange);
    socket.on('order:updated', onOrderChange);
    return () => {
      socket.off('table:updated', onTableUpdated);
      socket.off('order:new', onOrderChange);
      socket.off('order:updated', onOrderChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayRange]);

  // Table seating durations tick upward locally between refreshes
  useEffect(() => {
    const iv = setInterval(() => {
      setTables(prev => prev.map(t => (t.status === 'occupied' ? { ...t, since: t.since + 1 } : t)));
    }, 60000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#1C1A17', color: '#EDE7DD', fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
        * { box-sizing: border-box; }
        .display { font-family: 'Oswald', sans-serif; text-transform: uppercase; letter-spacing: 0.04em; }
        .mono { font-family: 'IBM Plex Mono', monospace; }
        button { font-family: inherit; cursor: pointer; }
        .badge { display: inline-flex; align-items: center; font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; padding: 3px 8px; border-radius: 999px; border: 1px solid; white-space: nowrap; }
        .tab-btn { font-family: 'Oswald', sans-serif; text-transform: uppercase; letter-spacing: 0.04em; font-size: 12.5px; font-weight: 600; padding: 10px 16px; border-radius: 10px 10px 0 0; border: none; white-space: nowrap; }
        .rail::-webkit-scrollbar { height: 0; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px);} to { opacity: 1; transform: translateY(0);} }
        .fade-in { animation: fadeIn 0.25s ease-out; }
      `}</style>

      {/* Header */}
      <header style={{ position: 'sticky', top: 0, zIndex: 30, background: 'rgba(28,26,23,0.94)', backdropFilter: 'blur(8px)', borderBottom: '1px solid #3A352E' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: '#262320', border: '1px solid #C68A3E', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C68A3E', flexShrink: 0 }}>
              <Flame size={20} />
            </div>
            <div>
              <div className="display" style={{ fontSize: 20, fontWeight: 700, lineHeight: 1 }}>Owner Dashboard</div>
              <div className="mono" style={{ fontSize: 11, color: '#A79E8E', marginTop: 2 }}>Coal &amp; Clay \u00b7 Jaipur</div>
            </div>
          </div>

          {/* Day range selector */}
          <div style={{ display: 'flex', background: '#262320', border: '1px solid #3A352E', borderRadius: 10, padding: 3 }}>
            {['today', 'week', 'month'].map(r => (
              <button key={r} onClick={() => setDayRange(r)} style={{
                padding: '7px 14px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600,
                background: dayRange === r ? '#C68A3E' : 'transparent',
                color: dayRange === r ? '#1C1A17' : '#A79E8E',
              }}>
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>
        </div>

        <div className="rail" style={{ maxWidth: 1200, margin: '0 auto', padding: '0 20px', display: 'flex', gap: 4, overflowX: 'auto' }}>
          {[
            { id: 'overview', label: 'Overview', icon: BarChart3 },
            { id: 'tables', label: 'Active tables', icon: LayoutGrid },
            { id: 'staff', label: 'Staff', icon: UserCheck },
            { id: 'orders', label: 'Order overview', icon: Receipt },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className="tab-btn" style={{
              display: 'flex', alignItems: 'center', gap: 7,
              background: tab === t.id ? '#262320' : 'transparent',
              color: tab === t.id ? '#EDE7DD' : '#A79E8E',
              borderBottom: tab === t.id ? '2px solid #C68A3E' : '2px solid transparent',
            }}>
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '22px 20px 60px' }}>
        {tab === 'overview' && (
          <div className="fade-in">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 22 }}>
              <KpiCard icon={Receipt} label={`Orders \u00b7 ${data.label.toLowerCase()}`} value={data.orders} accent="#C68A3E" />
              <KpiCard icon={IndianRupee} label="Sales revenue" value={fmtINR(data.sales)} accent="#7A9B57" />
              <KpiCard icon={TrendingUp} label="Estimated profit" value={fmtINR(data.profit)} accent="#E8C685" />
              <KpiCard icon={Users} label={`Active tables \u00b7 ${tables.length} total`} value={`${occupied}/${tables.length}`} accent="#C1503D" />
              <KpiCard icon={Receipt} label="Avg. order value" value={fmtINR(avgOrderValue)} accent="#A79E8E" />
              <KpiCard icon={Clock} label="Peak hour" value={peakSlot.hour} accent="#C68A3E" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 16, marginBottom: 4 }}>
              <div style={{ background: '#262320', border: '1px solid #3A352E', borderRadius: 14, padding: 18, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <h3 className="display" style={{ fontSize: 14, color: '#A79E8E' }}>Sales trend</h3>
                  <span style={{ fontSize: 11, color: '#6E665A' }}>{data.label}</span>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={data.trend} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#C68A3E" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#C68A3E" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#3A352E" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="t" stroke="#6E665A" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#6E665A" fontSize={11} tickLine={false} axisLine={false} tickFormatter={v => `₹${v / 1000}k`} />
                    <Tooltip
                      contentStyle={{ background: '#1C1A17', border: '1px solid #3A352E', borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: '#A79E8E' }}
                      formatter={v => [fmtINR(v), 'Sales']}
                    />
                    <Area type="monotone" dataKey="sales" stroke="#C68A3E" strokeWidth={2} fill="url(#salesFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div style={{ background: '#262320', border: '1px solid #3A352E', borderRadius: 14, padding: 18, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <h3 className="display" style={{ fontSize: 14, color: '#A79E8E' }}>Peak hours</h3>
                  <span className="badge" style={{ color: '#1C1A17', background: '#C68A3E', borderColor: '#C68A3E' }}>Peak {peakSlot.hour}</span>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={peakChartData} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                    <CartesianGrid stroke="#3A352E" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="hour" stroke="#6E665A" fontSize={10} tickLine={false} axisLine={false} interval={0} />
                    <YAxis stroke="#6E665A" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ background: '#1C1A17', border: '1px solid #3A352E', borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: '#A79E8E' }}
                      formatter={v => [v, 'Orders']}
                    />
                    <Bar dataKey="orders" radius={[4, 4, 0, 0]}>
                      {peakChartData.map((p, i) => (
                        <Cell key={i} fill={p.hourNum === peak.peakHour ? '#C68A3E' : '#3A352E'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {tab === 'tables' && (
          <div className="fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 className="display" style={{ fontSize: 16, color: '#A79E8E' }}>Active tables</h2>
              <span style={{ fontSize: 12.5, color: '#A79E8E' }}>{occupied} occupied &middot; {tables.filter(t => t.status === 'available').length} available &middot; {tables.filter(t => t.status === 'reserved').length} reserved</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
              {tables.map(t => {
                const cfg = {
                  occupied: { color: '#E08D7C', bg: 'rgba(193,80,61,0.12)', border: 'rgba(193,80,61,0.4)', label: 'Occupied' },
                  available: { color: '#A9C98B', bg: 'rgba(122,155,87,0.12)', border: 'rgba(122,155,87,0.4)', label: 'Available' },
                  reserved: { color: '#E8C685', bg: 'rgba(209,162,74,0.12)', border: 'rgba(209,162,74,0.4)', label: 'Reserved' },
                }[t.status];
                return (
                  <div key={t.id} style={{ background: '#262320', border: `1px solid ${cfg.border}`, borderRadius: 12, padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="mono" style={{ fontWeight: 700, fontSize: 15 }}>{t.id}</span>
                      <Circle size={8} fill={cfg.color} color={cfg.color} />
                    </div>
                    <div style={{ fontSize: 11, color: '#6E665A', marginTop: 4 }}>Seats {t.seats}</div>
                    <span className="badge" style={{ color: cfg.color, background: cfg.bg, borderColor: cfg.border, marginTop: 10 }}>{cfg.label}</span>
                    {t.status === 'occupied' && <div style={{ fontSize: 11, color: '#A79E8E', marginTop: 8 }}>Party of {t.party} &middot; {t.since}m seated</div>}
                    {t.status === 'reserved' && <div style={{ fontSize: 11, color: '#A79E8E', marginTop: 8 }}>Booked for {t.time}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'staff' && (
          <div className="fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 className="display" style={{ fontSize: 16, color: '#A79E8E' }}>Staff overview</h2>
              <span style={{ fontSize: 12.5, color: '#A79E8E' }}>{staff.filter(s => s.onDuty).length}/{staff.length} on duty</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {staff.map(s => (
                <div key={s.id} style={{
                  background: '#262320', border: '1px solid #3A352E', borderRadius: 12, padding: '12px 16px',
                  display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: '50%', background: '#1C1A17', border: '1px solid #3A352E',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0,
                  }}>
                    {s.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div style={{ minWidth: 160, flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{s.name}</div>
                    <div style={{ fontSize: 11.5, color: '#A79E8E', marginTop: 2 }}>{s.role} &middot; {s.shift}</div>
                  </div>
                  <div className="mono" style={{ fontSize: 12, color: '#A79E8E', minWidth: 90 }}>{s.orders} orders</div>
                  <span className="badge" style={{
                    color: s.onDuty ? '#A9C98B' : '#A79E8E',
                    background: s.onDuty ? 'rgba(122,155,87,0.12)' : 'rgba(167,158,142,0.1)',
                    borderColor: s.onDuty ? 'rgba(122,155,87,0.4)' : '#3A352E',
                  }}>
                    <Circle size={6} fill="currentColor" style={{ marginRight: 5 }} />
                    {s.onDuty ? 'On duty' : 'Off shift'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'orders' && (
          <div className="fade-in">
            <h2 className="display" style={{ fontSize: 16, marginBottom: 16, color: '#A79E8E' }}>Order overview</h2>
            <div style={{ background: '#262320', border: '1px solid #3A352E', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{
                display: 'grid', gridTemplateColumns: '0.7fr 0.8fr 0.6fr 0.9fr 0.9fr 0.8fr', padding: '10px 16px',
                fontSize: 11, color: '#6E665A', borderBottom: '1px solid #3A352E', textTransform: 'uppercase', letterSpacing: '0.03em',
              }}>
                <span>Order</span><span>Table</span><span>Items</span><span>Amount</span><span>Payment</span><span>Time</span>
              </div>
              {recentOrders.map(o => (
                <div key={o.id} style={{
                  display: 'grid', gridTemplateColumns: '0.7fr 0.8fr 0.6fr 0.9fr 0.9fr 0.8fr', padding: '13px 16px',
                  fontSize: 13, borderBottom: '1px solid #3A352E', alignItems: 'center',
                }}>
                  <span className="mono">#{o.id}</span>
                  <span>{o.table}</span>
                  <span style={{ color: '#A79E8E' }}>{o.items}</span>
                  <span className="mono">{fmtINR(o.amount)}</span>
                  <span className="badge" style={{
                    color: o.payment === 'Paid' ? '#A9C98B' : '#E8C685',
                    background: o.payment === 'Paid' ? 'rgba(122,155,87,0.12)' : 'rgba(209,162,74,0.12)',
                    borderColor: o.payment === 'Paid' ? 'rgba(122,155,87,0.4)' : 'rgba(209,162,74,0.4)',
                    width: 'fit-content',
                  }}>{o.payment}</span>
                  <span style={{ color: '#6E665A', fontSize: 11.5 }}>{o.time}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <footer style={{ borderTop: '1px solid #3A352E', padding: '18px 20px', textAlign: 'center', fontSize: 11.5, color: '#6E665A' }}>
        Coal &amp; Clay \u00b7 Owner access only
      </footer>
    </div>
  );
}