import { useState, useEffect, useRef } from 'react';
import {
  Flame, ChefHat, Clock, AlertTriangle, CheckCircle2, XCircle, Package,
  Bell, Zap, RefreshCw, Plus, Check, ArrowRight, UtensilsCrossed, Ban, Timer
} from 'lucide-react';
import { api } from './lib/api';
import { getSocket } from './lib/socket';

const STAGES = ['Received', 'Preparing', 'Plating', 'Served'];
const PRIORITY = { vip: { label: 'VIP', weight: 3, color: '#C68A3E' }, rush: { label: 'Rush', weight: 2, color: '#C1503D' }, standard: { label: 'Standard', weight: 1, color: '#7A9B57' } };

function timeAgo(date) {
  const s = Math.floor((Date.now() - date) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  return `${m}m ago`;
}

function TicketNotches({ bg = '#1C1A17' }) {
  return (
    <div style={{ position: 'relative', height: 12, margin: '0 -2px' }}>
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `radial-gradient(circle at 6px 6px, ${bg} 5px, transparent 5.5px)`,
        backgroundSize: '16px 12px', backgroundRepeat: 'repeat-x',
      }} />
    </div>
  );
}

function Badge({ children, color, bg, border }) {
  return (
    <span className="badge" style={{ color, background: bg, borderColor: border }}>
      {children}
    </span>
  );
}

export default function KitchenDashboard() {
  const [ingredients, setIngredients] = useState([]);
  const [dishes, setDishes] = useState([]); // [{ id, name, category, needs: [ingredientId], available }]
  const [orders, setOrders] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [tab, setTab] = useState('queue');
  const [flashIds, setFlashIds] = useState({});
  const notifiedZero = useRef(new Set());

  const pushNotification = (text, type) => {
    setNotifications(n => [{ id: Date.now() + Math.random(), text, type, time: new Date(), read: false }, ...n].slice(0, 30));
  };

  const normalizeOrder = (o) => ({
    id: o.id,
    items: o.items,
    table: o.table ? o.table.label : 'Takeaway',
    priority: o.priority,
    status: o.status,
    placedAt: new Date(o.createdAt),
  });

  // Menu items come back with their linked ingredients; flatten that into the
  // { needs: [ingredientId] } shape this board renders, and derive the
  // available/low/unavailable state straight from `available` + live ingredient stock.
  const normalizeDish = (item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    available: item.available,
    needs: item.ingredients.map(l => l.ingredientId),
  });

  const loadMenu = () => api.getMenu().then(items => setDishes(items.map(normalizeDish))).catch(() => {});
  const loadIngredients = () => api.getIngredients().then(setIngredients).catch(() => {});

  // Initial load
  useEffect(() => {
    loadMenu();
    loadIngredients();
    api.getOrders().then(list => setOrders(list.map(normalizeOrder))).catch(() => {});
  }, []);

  // Live updates over Socket.IO
  useEffect(() => {
    const socket = getSocket();

    const onOrderNew = (order) => {
      const norm = normalizeOrder(order);
      setOrders(prev => [norm, ...prev]);
      setFlashIds(f => ({ ...f, [`o${norm.id}`]: Date.now() }));
      const label = norm.priority !== 'standard' ? ` \u2014 ${norm.priority === 'vip' ? 'VIP' : 'Rush'}` : '';
      pushNotification(`New order #${norm.id} from ${norm.table}${label}`, 'order');
    };
    const onOrderUpdated = (order) => {
      setOrders(prev => prev.map(o => (o.id === order.id ? { ...o, status: order.status, priority: order.priority } : o)));
    };
    const onMenuUpdated = (item) => {
      setFlashIds(f => ({ ...f, [`d${item.id}`]: Date.now() }));
      loadMenu();
    };
    const onIngredientUpdated = (ing) => {
      setFlashIds(f => ({ ...f, [`i${ing.id}`]: Date.now() }));
      setIngredients(prev => prev.map(i => (i.id === ing.id ? ing : i)));
      if (ing.stock <= 0 && !notifiedZero.current.has(ing.id)) {
        notifiedZero.current.add(ing.id);
        pushNotification(`${ing.name} just ran out \u2014 linked dishes marked unavailable`, 'stock');
      } else if (ing.stock > 0 && notifiedZero.current.has(ing.id)) {
        notifiedZero.current.delete(ing.id);
      }
    };

    socket.on('order:new', onOrderNew);
    socket.on('order:updated', onOrderUpdated);
    socket.on('menu:updated', onMenuUpdated);
    socket.on('ingredient:updated', onIngredientUpdated);
    return () => {
      socket.off('order:new', onOrderNew);
      socket.off('order:updated', onOrderUpdated);
      socket.off('menu:updated', onMenuUpdated);
      socket.off('ingredient:updated', onIngredientUpdated);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // clear flash highlights
  useEffect(() => {
    const iv = setInterval(() => {
      setFlashIds(f => {
        const now = Date.now();
        const copy = { ...f };
        let changed = false;
        Object.keys(copy).forEach(k => { if (now - copy[k] > 900) { delete copy[k]; changed = true; } });
        return changed ? copy : f;
      });
    }, 400);
    return () => clearInterval(iv);
  }, []);

  const dishStatus = (dish) => {
    if (!dish.available) {
      const outIng = dish.needs.map(id => ingredients.find(i => i.id === id)).find(i => i && i.stock <= 0);
      return { state: 'unavailable', reason: outIng ? `Out of ${outIng.name.toLowerCase()}` : '86\u2019d by kitchen' };
    }
    const lowIng = dish.needs.map(id => ingredients.find(i => i.id === id)).find(i => i && i.stock <= i.threshold);
    if (lowIng) return { state: 'low', reason: `${lowIng.name} running low` };
    return { state: 'available', reason: null };
  };

  const advanceStage = async (id) => {
    const order = orders.find(o => o.id === id);
    if (!order) return;
    const idx = STAGES.indexOf(order.status);
    if (idx >= STAGES.length - 1) return;
    const nextStatus = STAGES[idx + 1];
    try {
      await api.updateOrderStatus(id, nextStatus);
      setOrders(prev => prev.map(o => (o.id === id ? { ...o, status: nextStatus } : o)));
      if (nextStatus === 'Preparing') pushNotification(`Order #${id} is being prepared`, 'progress');
      if (nextStatus === 'Plating') pushNotification(`Order #${id} is being plated`, 'progress');
      if (nextStatus === 'Served') pushNotification(`Order #${id} served \u2014 ready for pickup`, 'progress');
    } catch (err) {
      pushNotification(`Couldn't update order #${id}: ${err.message}`, 'progress');
    }
  };

  const bumpPriority = async (id) => {
    try {
      await api.updateOrderPriority(id, 'rush');
      setOrders(prev => prev.map(o => (o.id === id ? { ...o, priority: 'rush' } : o)));
    } catch (err) {
      pushNotification(`Couldn't bump priority: ${err.message}`, 'progress');
    }
  };

  const toggle86 = async (dishId) => {
    const dish = dishes.find(d => d.id === dishId);
    if (!dish) return;
    try {
      const updated = await api.setMenuAvailability(dishId, !dish.available);
      setDishes(prev => prev.map(d => (d.id === dishId ? { ...d, available: updated.available } : d)));
      pushNotification(`${dish.name} ${!updated.available ? 'marked unavailable by kitchen' : 'brought back on the menu'}`, 'menu');
    } catch (err) {
      pushNotification(`Couldn't update ${dish.name}: ${err.message}`, 'menu');
    }
  };

  const restock = async (id) => {
    const ing = ingredients.find(i => i.id === id);
    if (!ing) return;
    try {
      const { ingredient, restoredMenuItems } = await api.restockIngredient(id);
      setIngredients(prev => prev.map(i => (i.id === id ? ingredient : i)));
      if (restoredMenuItems?.length) {
        setDishes(prev => prev.map(d => {
          const match = restoredMenuItems.find(r => r.id === d.id);
          return match ? { ...d, available: true } : d;
        }));
      }
      pushNotification(`${ingredient.name} restocked to ${ingredient.max}${ingredient.unit}`, 'stock');
    } catch (err) {
      pushNotification(`Couldn't restock ${ing.name}: ${err.message}`, 'stock');
    }
  };

  const activeOrders = orders.filter(o => o.status !== 'Served');
  const queue = [...activeOrders].sort((a, b) => {
    const pw = PRIORITY[b.priority].weight - PRIORITY[a.priority].weight;
    if (pw !== 0) return pw;
    return a.placedAt - b.placedAt;
  });

  const unavailableDishes = dishes.filter(d => dishStatus(d).state === 'unavailable');
  const lowStockDishes = dishes.filter(d => dishStatus(d).state === 'low');
  const outIngredients = ingredients.filter(i => i.stock <= 0);
  const lowIngredients = ingredients.filter(i => i.stock > 0 && i.stock <= i.threshold);
  const rushCount = activeOrders.filter(o => o.priority !== 'standard').length;
  const unreadCount = notifications.filter(n => !n.read).length;

  const openNotifs = () => {
    setNotifOpen(v => !v);
    if (!notifOpen) setNotifications(n => n.map(x => ({ ...x, read: true })));
  };

  return (
    <div style={{ minHeight: '100vh', background: '#1C1A17', color: '#EDE7DD', fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
        * { box-sizing: border-box; }
        .display { font-family: 'Oswald', sans-serif; text-transform: uppercase; letter-spacing: 0.04em; }
        .mono { font-family: 'IBM Plex Mono', monospace; }
        button { font-family: inherit; cursor: pointer; }
        .badge { display: inline-flex; align-items: center; font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; padding: 3px 8px; border-radius: 999px; border: 1px solid; white-space: nowrap; }
        .pulse-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; animation: pulseDot 1.6s ease-in-out infinite; }
        @keyframes pulseDot { 0%,100% { opacity: 1; } 50% { opacity: 0.55; } }
        @keyframes flashHighlight { 0% { box-shadow: inset 0 0 0 999px rgba(198,138,62,0.25);} 100% { box-shadow: inset 0 0 0 999px rgba(198,138,62,0);} }
        .flash { animation: flashHighlight 0.9s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px);} to { opacity: 1; transform: translateY(0);} }
        .fade-in { animation: fadeIn 0.25s ease-out; }
        .tab-btn { font-family: 'Oswald', sans-serif; text-transform: uppercase; letter-spacing: 0.04em; font-size: 12.5px; font-weight: 600; padding: 10px 16px; border-radius: 10px 10px 0 0; border: none; white-space: nowrap; }
        .rail::-webkit-scrollbar { height: 0; }
      `}</style>

      {/* Header */}
      <header style={{ position: 'sticky', top: 0, zIndex: 40, background: 'rgba(28,26,23,0.94)', backdropFilter: 'blur(8px)', borderBottom: '1px solid #3A352E' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: '#262320', border: '1px solid #C68A3E', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C68A3E', flexShrink: 0 }}>
              <ChefHat size={20} />
            </div>
            <div>
              <div className="display" style={{ fontSize: 20, fontWeight: 700, lineHeight: 1 }}>Kitchen Board</div>
              <div className="mono" style={{ fontSize: 11, color: '#A79E8E', marginTop: 2 }}>Coal &amp; Clay \u00b7 Expo station</div>
            </div>
          </div>
          <div style={{ position: 'relative' }}>
            <button onClick={openNotifs} style={{ position: 'relative', width: 42, height: 42, borderRadius: 10, background: '#262320', border: '1px solid #3A352E', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#EDE7DD' }}>
              <Bell size={18} />
              {unreadCount > 0 && (
                <span style={{ position: 'absolute', top: -4, right: -4, background: '#C1503D', color: '#fff', fontSize: 10, minWidth: 18, height: 18, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'IBM Plex Mono', monospace", padding: '0 4px' }}>{unreadCount}</span>
              )}
            </button>
            {notifOpen && (
              <div className="fade-in" style={{ position: 'absolute', right: 0, top: 50, width: 320, maxHeight: 380, overflowY: 'auto', background: '#262320', border: '1px solid #3A352E', borderRadius: 12, padding: 8, zIndex: 50, boxShadow: '0 12px 32px rgba(0,0,0,0.4)' }}>
                {notifications.length === 0 ? (
                  <div style={{ padding: 20, textAlign: 'center', color: '#A79E8E', fontSize: 13 }}>No activity yet.</div>
                ) : notifications.map(n => (
                  <div key={n.id} style={{ padding: '10px 10px', borderBottom: '1px solid #3A352E', fontSize: 13 }}>
                    <div style={{ color: '#EDE7DD' }}>{n.text}</div>
                    <div className="mono" style={{ color: '#A79E8E', fontSize: 10, marginTop: 3 }}>{timeAgo(n.time)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Summary strip */}
        <div className="rail" style={{ maxWidth: 1180, margin: '0 auto', padding: '0 20px 14px', display: 'flex', gap: 10, overflowX: 'auto' }}>
          <SummaryCard icon={UtensilsCrossed} label="Active orders" value={activeOrders.length} color="#C68A3E" />
          <SummaryCard icon={Zap} label="Rush / VIP" value={rushCount} color="#C1503D" />
          <SummaryCard icon={Ban} label="Unavailable dishes" value={unavailableDishes.length} color="#C1503D" />
          <SummaryCard icon={Package} label="Ingredients low/out" value={lowIngredients.length + outIngredients.length} color="#D1A24A" />
        </div>

        {/* Tabs */}
        <div className="rail" style={{ maxWidth: 1180, margin: '0 auto', padding: '0 20px', display: 'flex', gap: 4, overflowX: 'auto' }}>
          {[
            { id: 'queue', label: 'Order queue', icon: Clock },
            { id: 'menu', label: 'Dish availability', icon: UtensilsCrossed },
            { id: 'stock', label: 'Ingredients', icon: Package },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className="tab-btn" style={{
              display: 'flex', alignItems: 'center', gap: 7,
              background: tab === t.id ? '#262320' : 'transparent',
              color: tab === t.id ? '#EDE7DD' : '#A79E8E',
              borderBottom: tab === t.id ? '2px solid #C68A3E' : '2px solid transparent',
            }}>
              <t.icon size={14} /> {t.label}
              {t.id === 'menu' && unavailableDishes.length > 0 && (
                <span style={{ background: '#C1503D', color: '#fff', borderRadius: 8, fontSize: 10, padding: '1px 6px' }}>{unavailableDishes.length}</span>
              )}
              {t.id === 'stock' && outIngredients.length > 0 && (
                <span style={{ background: '#C1503D', color: '#fff', borderRadius: 8, fontSize: 10, padding: '1px 6px' }}>{outIngredients.length}</span>
              )}
            </button>
          ))}
        </div>
      </header>

      <main style={{ maxWidth: 1180, margin: '0 auto', padding: '22px 20px 60px' }}>
        {tab === 'queue' && (
          <div className="fade-in">
            <h2 className="display" style={{ fontSize: 16, marginBottom: 4, color: '#A79E8E' }}>Priority queue</h2>
            <p style={{ fontSize: 12.5, color: '#6E665A', marginBottom: 18 }}>Sorted VIP &rarr; Rush &rarr; Standard, oldest first within each tier.</p>
            {queue.length === 0 ? (
              <EmptyState text="No active orders. New tickets will appear here the moment a customer orders." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {queue.map((order, i) => {
                  const stageIdx = STAGES.indexOf(order.status);
                  const pr = PRIORITY[order.priority];
                  const isFlashing = flashIds[`o${order.id}`];
                  return (
                    <div key={order.id} className={isFlashing ? 'flash' : ''} style={{
                      background: '#262320', border: `1px solid ${order.priority !== 'standard' ? pr.color : '#3A352E'}`,
                      borderRadius: 14, padding: 16,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ width: 26, height: 26, borderRadius: 8, background: '#1C1A17', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#6E665A' }} className="mono">#{i + 1}</span>
                          <div>
                            <div className="mono" style={{ fontWeight: 700, fontSize: 14 }}>Order #{order.id} &middot; {order.table}</div>
                            <div style={{ fontSize: 11, color: '#A79E8E', marginTop: 2 }}>{timeAgo(order.placedAt)}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Badge color={pr.color} bg={`${pr.color}26`} border={`${pr.color}66`}>
                            {order.priority !== 'standard' && <Zap size={10} style={{ marginRight: 4 }} />}
                            {pr.label}
                          </Badge>
                          {order.priority === 'standard' && (
                            <button onClick={() => bumpPriority(order.id)} style={{
                              fontSize: 10.5, padding: '4px 8px', borderRadius: 8, border: '1px solid #3A352E',
                              background: 'transparent', color: '#A79E8E',
                            }}>Bump to rush</button>
                          )}
                        </div>
                      </div>

                      <div style={{ fontSize: 12.5, color: '#EDE7DD', marginBottom: 14 }}>
                        {order.items.map(it => `${it.name} \u00d7${it.qty}`).join(', ')}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {STAGES.map((s, idx) => (
                          <div key={s} style={{ display: 'flex', alignItems: 'center', flex: idx < STAGES.length - 1 ? 1 : 'unset' }}>
                            <div style={{
                              width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: idx <= stageIdx ? '#7A9B57' : '#1C1A17', color: idx <= stageIdx ? '#1C1A17' : '#6E665A', flexShrink: 0,
                              border: idx <= stageIdx ? 'none' : '1px solid #3A352E',
                            }}>
                              {idx <= stageIdx ? <Check size={12} /> : <span style={{ fontSize: 10 }}>{idx + 1}</span>}
                            </div>
                            {idx < STAGES.length - 1 && <div style={{ flex: 1, height: 2, background: idx < stageIdx ? '#7A9B57' : '#3A352E' }} />}
                          </div>
                        ))}
                        <span style={{ fontSize: 11, color: '#A79E8E', minWidth: 62, textAlign: 'right' }}>{order.status}</span>
                      </div>

                      {order.status !== 'Served' && (
                        <button onClick={() => advanceStage(order.id)} style={{
                          marginTop: 14, width: '100%', padding: '10px 0', borderRadius: 9, border: 'none',
                          background: '#C68A3E', color: '#1C1A17', fontWeight: 700, fontSize: 13,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        }}>
                          Mark {STAGES[stageIdx + 1]} <ArrowRight size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'menu' && (
          <div className="fade-in">
            <h2 className="display" style={{ fontSize: 16, marginBottom: 4, color: '#A79E8E' }}>Dish availability</h2>
            <p style={{ fontSize: 12.5, color: '#6E665A', marginBottom: 18 }}>Dishes go unavailable automatically when a needed ingredient runs out, or you can 86 an item by hand.</p>

            {unavailableDishes.length > 0 && (
              <div style={{ background: 'rgba(193,80,61,0.1)', border: '1px solid rgba(193,80,61,0.35)', borderRadius: 12, padding: '12px 14px', marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, color: '#E08D7C', fontWeight: 700, fontSize: 13 }}>
                  <AlertTriangle size={15} /> Currently unavailable
                </div>
                <div style={{ fontSize: 12.5, color: '#EDE7DD' }}>
                  {unavailableDishes.map(d => d.name).join(', ')}
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
              {dishes.map(dish => {
                const status = dishStatus(dish);
                const flashing = flashIds[`d${dish.id}`];
                const cfg = {
                  available: { color: '#A9C98B', bg: 'rgba(122,155,87,0.12)', border: 'rgba(122,155,87,0.4)', icon: CheckCircle2, label: 'Available' },
                  low: { color: '#E8C685', bg: 'rgba(209,162,74,0.12)', border: 'rgba(209,162,74,0.4)', icon: AlertTriangle, label: status.reason },
                  unavailable: { color: '#E08D7C', bg: 'rgba(193,80,61,0.12)', border: 'rgba(193,80,61,0.4)', icon: XCircle, label: status.reason },
                }[status.state];
                return (
                  <div key={dish.id} className={flashing ? 'flash' : ''} style={{
                    background: '#262320', border: `1px solid ${cfg.border}`, borderRadius: 12, padding: 14,
                    display: 'flex', flexDirection: 'column', gap: 10,
                  }}>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{dish.name}</div>
                      <div className="mono" style={{ fontSize: 10.5, color: '#6E665A', marginTop: 2 }}>{dish.category}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: cfg.color, fontSize: 11.5 }}>
                      <cfg.icon size={13} /> {cfg.label}
                    </div>
                    <button onClick={() => toggle86(dish.id)} style={{
                      marginTop: 2, padding: '8px 0', borderRadius: 8, fontSize: 11.5, fontWeight: 600,
                      border: '1px solid #3A352E', background: !dish.available ? '#7A9B57' : 'transparent',
                      color: !dish.available ? '#1C1A17' : '#A79E8E',
                    }}>
                      {!dish.available ? 'Bring back on menu' : '86 this dish'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'stock' && (
          <div className="fade-in">
            <h2 className="display" style={{ fontSize: 16, marginBottom: 4, color: '#A79E8E' }}>Ingredient stock</h2>
            <p style={{ fontSize: 12.5, color: '#6E665A', marginBottom: 18 }}>Live levels from the pantry. Restock resets an item to full.</p>

            {outIngredients.length > 0 && (
              <div style={{ background: 'rgba(193,80,61,0.1)', border: '1px solid rgba(193,80,61,0.35)', borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#E08D7C', fontWeight: 700, fontSize: 13 }}>
                  <XCircle size={15} /> Out of stock: {outIngredients.map(i => i.name).join(', ')}
                </div>
              </div>
            )}
            {lowIngredients.length > 0 && (
              <div style={{ background: 'rgba(209,162,74,0.1)', border: '1px solid rgba(209,162,74,0.35)', borderRadius: 12, padding: '12px 14px', marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#E8C685', fontWeight: 700, fontSize: 13 }}>
                  <AlertTriangle size={15} /> Running low: {lowIngredients.map(i => i.name).join(', ')}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {ingredients.map(ing => {
                const pct = Math.min(100, (ing.stock / ing.max) * 100);
                const state = ing.stock <= 0 ? 'out' : ing.stock <= ing.threshold ? 'low' : 'ok';
                const barColor = state === 'out' ? '#C1503D' : state === 'low' ? '#D1A24A' : '#7A9B57';
                const flashing = flashIds[`i${ing.id}`];
                return (
                  <div key={ing.id} className={flashing ? 'flash' : ''} style={{
                    background: '#262320', border: '1px solid #3A352E', borderRadius: 12, padding: '12px 16px',
                    display: 'flex', alignItems: 'center', gap: 16,
                  }}>
                    <div style={{ minWidth: 150 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{ing.name}</div>
                      <div className="mono" style={{ fontSize: 11, color: '#A79E8E', marginTop: 2 }}>{ing.stock}{ing.unit} / {ing.max}{ing.unit}</div>
                    </div>
                    <div style={{ flex: 1, height: 8, borderRadius: 4, background: '#1C1A17', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: barColor, transition: 'width 0.3s' }} />
                    </div>
                    {state === 'out' && <Badge color="#E08D7C" bg="rgba(193,80,61,0.15)" border="rgba(193,80,61,0.4)">Out</Badge>}
                    {state === 'low' && <Badge color="#E8C685" bg="rgba(209,162,74,0.15)" border="rgba(209,162,74,0.4)">Low</Badge>}
                    {state === 'ok' && <Badge color="#A9C98B" bg="rgba(122,155,87,0.15)" border="rgba(122,155,87,0.4)">OK</Badge>}
                    <button onClick={() => restock(ing.id)} style={{
                      display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600,
                      padding: '7px 10px', borderRadius: 8, border: '1px solid #3A352E', background: 'transparent', color: '#C68A3E',
                    }}>
                      <RefreshCw size={12} /> Restock
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      <footer style={{ borderTop: '1px solid #3A352E', padding: '18px 20px', textAlign: 'center', fontSize: 11.5, color: '#6E665A' }}>
        Coal &amp; Clay Kitchen \u00b7 Internal use only
      </footer>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, color }) {
  return (
    <div style={{
      flexShrink: 0, background: '#262320', border: '1px solid #3A352E', borderRadius: 10,
      padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 168,
    }}>
      <div style={{ width: 30, height: 30, borderRadius: 8, background: `${color}22`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={15} />
      </div>
      <div>
        <div className="mono" style={{ fontSize: 15, fontWeight: 700, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 10.5, color: '#A79E8E', marginTop: 3 }}>{label}</div>
      </div>
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div style={{ color: '#6E665A', fontSize: 13, fontStyle: 'italic', padding: '30px 0', textAlign: 'center' }}>
      {text}
    </div>
  );
}