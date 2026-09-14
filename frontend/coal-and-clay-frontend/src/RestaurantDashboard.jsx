import { useState, useEffect, useRef } from 'react';
import {
  Flame, Bell, ChefHat, Clock, Users, Plus, Minus, X, Check,
  CalendarDays, Receipt, ArrowRight, UtensilsCrossed, Soup, IndianRupee
} from 'lucide-react';
import { api, withDerivedStock } from './lib/api';
import { getSocket } from './lib/socket';

const CATEGORIES = ['Starters', 'Mains', 'Tandoor & Grill', 'Breads', 'Desserts', 'Drinks'];

const STAGES = ['Received', 'Preparing', 'Plating', 'Served'];
const TIME_SLOTS = ['12:30 PM', '1:30 PM', '7:30 PM', '8:30 PM', '9:30 PM'];

function timeAgo(date) {
  const s = Math.floor((Date.now() - date) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function VegDot({ veg }) {
  const color = veg ? '#7A9B57' : '#C1503D';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 14, height: 14, border: `1.5px solid ${color}`, borderRadius: 3, flexShrink: 0,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
    </span>
  );
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

function StatusBadge({ stock }) {
  if (stock === 0) {
    return (
      <span className="badge" style={{ background: 'rgba(193,80,61,0.15)', color: '#E08D7C', borderColor: 'rgba(193,80,61,0.4)' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#C1503D', marginRight: 6 }} />
        Sold out
      </span>
    );
  }
  if (stock <= 3) {
    return (
      <span className="badge" style={{ background: 'rgba(209,162,74,0.15)', color: '#E8C685', borderColor: 'rgba(209,162,74,0.4)' }}>
        <span className="pulse-dot" style={{ background: '#D1A24A', marginRight: 6 }} />
        Only {stock} left
      </span>
    );
  }
  return (
    <span className="badge" style={{ background: 'rgba(122,155,87,0.15)', color: '#A9C98B', borderColor: 'rgba(122,155,87,0.4)' }}>
      <span className="pulse-dot" style={{ background: '#7A9B57', marginRight: 6 }} />
      Available
    </span>
  );
}

export default function RestaurantDashboard() {
  const [menu, setMenu] = useState([]);
  const [cart, setCart] = useState({});
  const [orders, setOrders] = useState([]);
  const [reservation, setReservation] = useState(null);
  const [servingToken, setServingToken] = useState(11);
  const [notifications, setNotifications] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [tab, setTab] = useState('menu');
  const [activeCategory, setActiveCategory] = useState('All');
  const [flashIds, setFlashIds] = useState({});
  const [resParty, setResParty] = useState(2);
  const [resTime, setResTime] = useState(TIME_SLOTS[0]);
  const tokenCounter = useRef(15);

  const pushNotification = (text, type) => {
    setNotifications(n => [{ id: Date.now() + Math.random(), text, type, time: new Date(), read: false }, ...n].slice(0, 25));
  };

  // Initial menu load from the backend
  useEffect(() => {
    api.getMenu()
      .then(items => setMenu(items.map(withDerivedStock)))
      .catch(err => console.error('Failed to load menu:', err));
  }, []);

  // Live updates: menu availability changes and ingredient stock changes both
  // affect the "portions left" badge, so refetch the affected item's derived
  // stock whenever either event fires. Order updates patch matching orders.
  useEffect(() => {
    const socket = getSocket();

    const refreshMenu = () => {
      api.getMenu().then(items => setMenu(items.map(withDerivedStock))).catch(() => {});
    };

    const onMenuUpdated = (item) => {
      setFlashIds(f => ({ ...f, [item.id]: Date.now() }));
      refreshMenu();
    };
    const onIngredientUpdated = () => refreshMenu();

    const onOrderUpdated = (order) => {
      setOrders(prev => {
        if (!prev.some(o => o.id === order.id)) return prev;
        pushNotification(`Order #${order.id} is now ${order.status}`, 'order');
        return prev.map(o => (o.id === order.id ? { ...o, ...normalizeOrder(order) } : o));
      });
    };

    socket.on('menu:updated', onMenuUpdated);
    socket.on('ingredient:updated', onIngredientUpdated);
    socket.on('order:updated', onOrderUpdated);
    return () => {
      socket.off('menu:updated', onMenuUpdated);
      socket.off('ingredient:updated', onIngredientUpdated);
      socket.off('order:updated', onOrderUpdated);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // queue ticking
  useEffect(() => {
    if (!reservation || reservation.status !== 'Waiting') return;
    const iv = setInterval(() => {
      setServingToken(s => {
        if (s < reservation.tokenNum - 1) return s + 1;
        if (s === reservation.tokenNum - 1) {
          setTimeout(() => pushNotification(`Almost up! Table for ${reservation.party} is next in line.`, 'reservation'), 0);
          return s + 1;
        }
        return s;
      });
    }, 3800);
    return () => clearInterval(iv);
  }, [reservation]);

  const addToCart = (item) => {
    if (item.stock <= (cart[item.id] || 0)) return;
    setCart(c => ({ ...c, [item.id]: (c[item.id] || 0) + 1 }));
  };
  const removeFromCart = (id) => {
    setCart(c => {
      const qty = (c[id] || 0) - 1;
      const copy = { ...c };
      if (qty <= 0) delete copy[id]; else copy[id] = qty;
      return copy;
    });
  };

  const cartItems = Object.entries(cart).map(([id, qty]) => {
    const item = menu.find(m => m.id === Number(id));
    return item ? { ...item, qty } : null;
  }).filter(Boolean);
  const cartTotal = cartItems.reduce((s, i) => s + i.price * i.qty, 0);
  const cartCount = cartItems.reduce((s, i) => s + i.qty, 0);

  // Backend order shape -> the { placedAt, ... } shape this component renders.
  const normalizeOrder = (order) => ({
    id: order.id,
    items: order.items,
    total: order.total,
    status: order.status,
    paymentStatus: order.paymentStatus,
    placedAt: new Date(order.createdAt),
  });

  const placeOrder = async () => {
    if (!cartItems.length) return;
    try {
      const payload = {
        items: cartItems.map(({ id, qty }) => ({ menuItemId: id, qty })),
      };
      const order = await api.createOrder(payload);
      setOrders(o => [normalizeOrder(order), ...o]);
      setCart({});
      pushNotification(`Order #${order.id} placed! The kitchen has it now.`, 'order');
      setTab('order');
    } catch (err) {
      pushNotification(`Couldn't place order: ${err.message}`, 'order');
    }
  };

  const payOrder = async (id) => {
  try {
    const { razorpayOrderId, amount, currency, keyId } = await api.createPaymentOrder(id);

    const rzp = new window.Razorpay({
      key: keyId,
      amount,
      currency,
      name: 'Coal & Clay',
      description: `Order #${id}`,
      order_id: razorpayOrderId,
      theme: { color: '#C68A3E' },
      handler: async (response) => {
        try {
          const order = await api.verifyPayment(id, {
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          });
          setOrders(prev => prev.map(o => (o.id === id ? normalizeOrder(order) : o)));
          pushNotification(`Payment received for order #${id}. Thank you!`, 'billing');
        } catch (err) {
          pushNotification(`Payment verification failed: ${err.message}`, 'billing');
        }
      },
      modal: {
        ondismiss: () => pushNotification(`Payment cancelled for order #${id}.`, 'billing'),
      },
    });

    rzp.on('payment.failed', () => {
      pushNotification(`Payment failed for order #${id}.`, 'billing');
    });

    rzp.open();
  } catch (err) {
    pushNotification(`Couldn't start payment: ${err.message}`, 'billing');
  }
};

  const submitReservation = () => {
    const tokenNum = tokenCounter.current++;
    setReservation({ token: `Q-${String(tokenNum).padStart(3, '0')}`, tokenNum, party: resParty, time: resTime, status: 'Waiting' });
    pushNotification(`Table reserved — your queue token is Q-${String(tokenNum).padStart(3, '0')}.`, 'reservation');
    setTab('reserve');
  };

  const unreadCount = notifications.filter(n => !n.read).length;
  const openNotifs = () => {
    setNotifOpen(v => !v);
    if (!notifOpen) setNotifications(n => n.map(x => ({ ...x, read: true })));
  };

  const filteredMenu = activeCategory === 'All' ? menu : menu.filter(m => m.category === activeCategory);
  const groupedByCategory = CATEGORIES.map(cat => ({ cat, items: filteredMenu.filter(m => m.category === cat) })).filter(g => g.items.length);

  const activeTickets = [
    ...(reservation ? [{ type: 'reservation', key: 'res', label: reservation.token, sub: reservation.status === 'Waiting' ? `Now serving Q-${String(servingToken).padStart(3, '0')}` : 'Seated' }] : []),
    ...orders.filter(o => o.status !== 'Served').map(o => ({ type: 'order', key: `o${o.id}`, label: `Order #${o.id}`, sub: o.status })),
  ];

  const unpaidCount = orders.filter(o => o.paymentStatus === 'Pending').length;

  return (
    <div style={{
      minHeight: '100vh', background: '#1C1A17', color: '#EDE7DD',
      fontFamily: "'Inter', sans-serif", position: 'relative',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
        * { box-sizing: border-box; }
        .display { font-family: 'Oswald', sans-serif; text-transform: uppercase; letter-spacing: 0.04em; }
        .mono { font-family: 'IBM Plex Mono', monospace; }
        .badge {
          display: inline-flex; align-items: center; font-family: 'IBM Plex Mono', monospace;
          font-size: 11px; padding: 4px 8px; border-radius: 999px; border: 1px solid; white-space: nowrap;
        }
        .pulse-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; animation: pulseDot 1.6s ease-in-out infinite; }
        @keyframes pulseDot { 0%,100% { opacity: 1; box-shadow: 0 0 0 0 rgba(122,155,87,0.5);} 50% { opacity: 0.6; } }
        @keyframes flashHighlight { 0% { box-shadow: inset 0 0 0 999px rgba(198,138,62,0.25);} 100% { box-shadow: inset 0 0 0 999px rgba(198,138,62,0);} }
        .flash { animation: flashHighlight 0.9s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px);} to { opacity: 1; transform: translateY(0);} }
        .fade-in { animation: fadeIn 0.25s ease-out; }
        .rail::-webkit-scrollbar, .tabs::-webkit-scrollbar { height: 0px; }
        button { font-family: inherit; cursor: pointer; }
        input { font-family: inherit; }
        .stepper-btn { width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border-radius: 8px; border: 1px solid #3A352E; background: #262320; color: #EDE7DD; transition: background 0.15s; }
        .stepper-btn:hover { background: #322D27; }
        .stepper-btn:disabled { opacity: 0.35; cursor: not-allowed; }
        .tab-btn { font-family: 'Oswald', sans-serif; text-transform: uppercase; letter-spacing: 0.04em; font-size: 13px; font-weight: 600; padding: 10px 18px; border-radius: 10px 10px 0 0; border: none; white-space: nowrap; }
        .card-hover { transition: transform 0.15s ease, border-color 0.15s ease; }
        .card-hover:hover { transform: translateY(-2px); border-color: #C68A3E; }
      `}</style>

      {/* Header */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 40, background: 'rgba(28,26,23,0.92)',
        backdropFilter: 'blur(8px)', borderBottom: '1px solid #3A352E',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 10, background: '#262320', border: '1px solid #C68A3E',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C68A3E', flexShrink: 0,
            }}>
              <Flame size={20} />
            </div>
            <div>
              <div className="display" style={{ fontSize: 20, fontWeight: 700, lineHeight: 1 }}>Coal &amp; Clay</div>
              <div className="mono" style={{ fontSize: 11, color: '#A79E8E', marginTop: 2 }}>Live from the tandoor · Jaipur</div>
            </div>
          </div>
          <div style={{ position: 'relative' }}>
            <button onClick={openNotifs} style={{
              position: 'relative', width: 42, height: 42, borderRadius: 10, background: '#262320',
              border: '1px solid #3A352E', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#EDE7DD',
            }}>
              <Bell size={18} />
              {unreadCount > 0 && (
                <span style={{
                  position: 'absolute', top: -4, right: -4, background: '#C1503D', color: '#fff', fontSize: 10,
                  minWidth: 18, height: 18, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: "'IBM Plex Mono', monospace", padding: '0 4px',
                }}>{unreadCount}</span>
              )}
            </button>
            {notifOpen && (
              <div className="fade-in" style={{
                position: 'absolute', right: 0, top: 50, width: 320, maxHeight: 380, overflowY: 'auto',
                background: '#262320', border: '1px solid #3A352E', borderRadius: 12, padding: 8, zIndex: 50,
                boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
              }}>
                {notifications.length === 0 ? (
                  <div style={{ padding: 20, textAlign: 'center', color: '#A79E8E', fontSize: 13 }}>
                    No notifications yet. Place an order or reserve a table to see live updates here.
                  </div>
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

        {/* Ticket rail */}
        <div className="rail" style={{ maxWidth: 1100, margin: '0 auto', padding: '0 20px 14px', display: 'flex', gap: 10, overflowX: 'auto' }}>
          {activeTickets.length === 0 ? (
            <div style={{ fontSize: 12, color: '#6E665A', fontStyle: 'italic', padding: '6px 2px' }}>
              No active tickets — reserve a table or place an order to see live status here.
            </div>
          ) : activeTickets.map(t => (
            <div key={t.key} style={{
              flexShrink: 0, background: '#262320', border: '1px solid #3A352E', borderRadius: 10,
              padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 150,
            }}>
              <span className="pulse-dot" style={{ background: t.type === 'reservation' ? '#C68A3E' : '#7A9B57' }} />
              <div>
                <div className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{t.label}</div>
                <div style={{ fontSize: 11, color: '#A79E8E' }}>{t.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="tabs" style={{ maxWidth: 1100, margin: '0 auto', padding: '0 20px', display: 'flex', gap: 4, overflowX: 'auto' }}>
          {[
            { key: 'menu', label: 'Menu', icon: UtensilsCrossed },
            { key: 'reserve', label: 'Reserve', icon: CalendarDays },
            { key: 'order', label: `My Order${cartCount ? ` (${cartCount})` : ''}`, icon: Soup },
            { key: 'billing', label: `Billing${unpaidCount ? ` (${unpaidCount})` : ''}`, icon: Receipt },
          ].map(t => (
            <button key={t.key} className="tab-btn" onClick={() => setTab(t.key)} style={{
              background: tab === t.key ? '#262320' : 'transparent',
              color: tab === t.key ? '#C68A3E' : '#A79E8E',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <t.icon size={14} />{t.label}
            </button>
          ))}
        </div>
      </header>

      {/* Content */}
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px 80px' }}>

        {tab === 'menu' && (
          <div className="fade-in">
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 22, paddingBottom: 4 }}>
              {['All', ...CATEGORIES].map(cat => (
                <button key={cat} onClick={() => setActiveCategory(cat)} style={{
                  flexShrink: 0, padding: '7px 16px', borderRadius: 999, fontSize: 13, fontWeight: 500,
                  border: `1px solid ${activeCategory === cat ? '#C68A3E' : '#3A352E'}`,
                  background: activeCategory === cat ? 'rgba(198,138,62,0.15)' : 'transparent',
                  color: activeCategory === cat ? '#E0A85C' : '#A79E8E',
                }}>{cat}</button>
              ))}
            </div>

            {groupedByCategory.map(group => (
              <div key={group.cat} style={{ marginBottom: 34 }}>
                <h2 className="display" style={{ fontSize: 18, fontWeight: 600, color: '#E0A85C', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                  {group.cat}
                  <span style={{ flex: 1, height: 1, background: '#3A352E' }} />
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 14 }}>
                  {group.items.map(item => {
                    const qty = cart[item.id] || 0;
                    const isFlashing = !!flashIds[item.id];
                    return (
                      <div key={item.id} className={`card-hover ${isFlashing ? 'flash' : ''}`} style={{
                        background: '#262320', border: '1px solid #3A352E', borderRadius: 14, padding: 16,
                        display: 'flex', flexDirection: 'column', gap: 10,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                            <VegDot veg={item.veg} />
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 15 }}>{item.name}</div>
                              <div style={{ fontSize: 12.5, color: '#A79E8E', marginTop: 3, lineHeight: 1.4 }}>{item.desc}</div>
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                          <StatusBadge stock={item.stock} />
                          <div className="mono" style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                            <IndianRupee size={12} style={{ marginRight: 1 }} />{item.price}
                          </div>
                        </div>
                        <div style={{ marginTop: 4 }}>
                          {qty === 0 ? (
                            <button onClick={() => addToCart(item)} disabled={item.stock === 0} style={{
                              width: '100%', padding: '9px 0', borderRadius: 9, border: 'none',
                              background: item.stock === 0 ? '#3A352E' : '#C68A3E',
                              color: item.stock === 0 ? '#6E665A' : '#1C1A17',
                              fontWeight: 600, fontSize: 13, cursor: item.stock === 0 ? 'not-allowed' : 'pointer',
                            }}>
                              {item.stock === 0 ? 'Sold out' : 'Add to order'}
                            </button>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <button className="stepper-btn" onClick={() => removeFromCart(item.id)}><Minus size={14} /></button>
                              <span className="mono" style={{ fontWeight: 600 }}>{qty}</span>
                              <button className="stepper-btn" onClick={() => addToCart(item)} disabled={qty >= item.stock}><Plus size={14} /></button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'reserve' && (
          <div className="fade-in" style={{ maxWidth: 480, margin: '0 auto' }}>
            {!reservation ? (
              <div style={{ background: '#262320', border: '1px solid #3A352E', borderRadius: 16, padding: 24 }}>
                <h2 className="display" style={{ fontSize: 20, marginBottom: 4 }}>Reserve a table</h2>
                <p style={{ fontSize: 13, color: '#A79E8E', marginBottom: 22 }}>Get a queue token and we'll call you when your table's ready.</p>

                <div style={{ marginBottom: 20 }}>
                  <label style={{ fontSize: 12, color: '#A79E8E', display: 'block', marginBottom: 8 }}>Party size</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <button className="stepper-btn" onClick={() => setResParty(p => Math.max(1, p - 1))}><Minus size={14} /></button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Users size={16} color="#C68A3E" />
                      <span className="mono" style={{ fontSize: 16, fontWeight: 600 }}>{resParty}</span>
                    </div>
                    <button className="stepper-btn" onClick={() => setResParty(p => Math.min(12, p + 1))}><Plus size={14} /></button>
                  </div>
                </div>

                <div style={{ marginBottom: 24 }}>
                  <label style={{ fontSize: 12, color: '#A79E8E', display: 'block', marginBottom: 8 }}>Time slot</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {TIME_SLOTS.map(t => (
                      <button key={t} onClick={() => setResTime(t)} style={{
                        padding: '7px 14px', borderRadius: 8, fontSize: 12.5,
                        border: `1px solid ${resTime === t ? '#C68A3E' : '#3A352E'}`,
                        background: resTime === t ? 'rgba(198,138,62,0.15)' : 'transparent',
                        color: resTime === t ? '#E0A85C' : '#A79E8E',
                      }}>{t}</button>
                    ))}
                  </div>
                </div>

                <button onClick={submitReservation} style={{
                  width: '100%', padding: '12px 0', borderRadius: 10, border: 'none', background: '#C68A3E',
                  color: '#1C1A17', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: 8,
                }}>
                  Get queue token <ArrowRight size={15} />
                </button>
              </div>
            ) : (
              <div>
                <div style={{ background: '#F2E7D3', color: '#1C1A17', borderRadius: 16, padding: '22px 22px 4px', position: 'relative' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div className="mono" style={{ fontSize: 11, letterSpacing: 1, color: '#8A7E64' }}>QUEUE TOKEN</div>
                      <div className="mono" style={{ fontSize: 42, fontWeight: 700, lineHeight: 1.1, marginTop: 2 }}>{reservation.token}</div>
                    </div>
                    <ChefHat size={30} color="#C68A3E" />
                  </div>
                  <div style={{ display: 'flex', gap: 24, marginTop: 16, paddingBottom: 18 }}>
                    <div>
                      <div style={{ fontSize: 10.5, color: '#8A7E64' }}>PARTY</div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{reservation.party} guests</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10.5, color: '#8A7E64' }}>TIME</div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{reservation.time}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10.5, color: '#8A7E64' }}>WAIT</div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>~{Math.max(0, (reservation.tokenNum - servingToken)) * 6} min</div>
                    </div>
                  </div>
                </div>
                <TicketNotches bg="#1C1A17" />
                <div style={{ background: '#F2E7D3', color: '#1C1A17', borderRadius: '0 0 16px 16px', padding: '4px 22px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <span className="pulse-dot" style={{ background: '#7A9B57' }} />
                    Now serving <span className="mono" style={{ fontWeight: 700 }}>Q-{String(servingToken).padStart(3, '0')}</span>
                  </div>
                </div>
                <button onClick={() => setReservation(null)} style={{
                  marginTop: 16, width: '100%', padding: '10px 0', borderRadius: 10, border: '1px solid #3A352E',
                  background: 'transparent', color: '#A79E8E', fontSize: 13,
                }}>Cancel reservation</button>
              </div>
            )}
          </div>
        )}

        {tab === 'order' && (
          <div className="fade-in">
            {cartItems.length > 0 && (
              <div style={{ background: '#262320', border: '1px solid #C68A3E', borderRadius: 14, padding: 18, marginBottom: 28 }}>
                <h2 className="display" style={{ fontSize: 16, marginBottom: 12 }}>Your cart</h2>
                {cartItems.map(item => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #3A352E' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <VegDot veg={item.veg} />
                      <span style={{ fontSize: 13.5 }}>{item.name}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button className="stepper-btn" onClick={() => removeFromCart(item.id)}><Minus size={13} /></button>
                        <span className="mono" style={{ fontSize: 13 }}>{item.qty}</span>
                        <button className="stepper-btn" onClick={() => addToCart(item)} disabled={item.qty >= item.stock}><Plus size={13} /></button>
                      </div>
                      <span className="mono" style={{ fontSize: 13, minWidth: 54, textAlign: 'right' }}>₹{item.price * item.qty}</span>
                    </div>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
                  <span style={{ fontWeight: 600 }}>Subtotal</span>
                  <span className="mono" style={{ fontWeight: 700 }}>₹{cartTotal}</span>
                </div>
                <button onClick={placeOrder} style={{
                  width: '100%', marginTop: 14, padding: '12px 0', borderRadius: 10, border: 'none',
                  background: '#C68A3E', color: '#1C1A17', fontWeight: 700, fontSize: 14,
                }}>Place order</button>
              </div>
            )}

            <h2 className="display" style={{ fontSize: 16, marginBottom: 14, color: '#A79E8E' }}>Order status</h2>
            {orders.length === 0 ? (
              <div style={{ color: '#6E665A', fontSize: 13, fontStyle: 'italic' }}>No orders yet. Add dishes from the menu to get started.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {orders.map(order => {
                  const stageIdx = STAGES.indexOf(order.status);
                  return (
                    <div key={order.id} style={{ background: '#262320', border: '1px solid #3A352E', borderRadius: 14, padding: 18 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <div className="mono" style={{ fontWeight: 700, fontSize: 14 }}>Order #{order.id}</div>
                        <div style={{ fontSize: 11, color: '#A79E8E' }}>{timeAgo(order.placedAt)}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        {STAGES.map((s, i) => (
                          <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < STAGES.length - 1 ? 1 : 'unset' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 60 }}>
                              <div style={{
                                width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: i <= stageIdx ? '#7A9B57' : '#3A352E',
                                color: i <= stageIdx ? '#1C1A17' : '#6E665A',
                              }}>
                                {i <= stageIdx ? <Check size={13} /> : <span style={{ fontSize: 10 }}>{i + 1}</span>}
                              </div>
                              <div style={{ fontSize: 10.5, marginTop: 6, color: i <= stageIdx ? '#EDE7DD' : '#6E665A', textAlign: 'center' }}>{s}</div>
                            </div>
                            {i < STAGES.length - 1 && (
                              <div style={{ flex: 1, height: 2, background: i < stageIdx ? '#7A9B57' : '#3A352E', marginBottom: 18 }} />
                            )}
                          </div>
                        ))}
                      </div>
                      <div style={{ marginTop: 14, fontSize: 12.5, color: '#A79E8E' }}>
                        {order.items.map(i => `${i.name} ×${i.qty}`).join(', ')}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'billing' && (
          <div className="fade-in">
            <h2 className="display" style={{ fontSize: 18, marginBottom: 16 }}>Billing</h2>
            {orders.length === 0 ? (
              <div style={{ color: '#6E665A', fontSize: 13, fontStyle: 'italic' }}>No bills yet — your tab opens the moment you place an order.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {orders.map(order => {
                  const tax = Math.round(order.total * 0.05);
                  const grand = order.total + tax;
                  return (
                    <div key={order.id}>
                      <div style={{ background: '#F2E7D3', color: '#1C1A17', borderRadius: '16px 16px 0 0', padding: '18px 20px 10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div className="mono" style={{ fontWeight: 700 }}>Bill · Order #{order.id}</div>
                          <span className="badge" style={{
                            borderColor: order.paymentStatus === 'Paid' ? 'rgba(122,155,87,0.5)' : 'rgba(193,80,61,0.5)',
                            color: order.paymentStatus === 'Paid' ? '#4C6B36' : '#8A3A2C',
                            background: order.paymentStatus === 'Paid' ? 'rgba(122,155,87,0.15)' : 'rgba(193,80,61,0.15)',
                          }}>{order.paymentStatus}</span>
                        </div>
                        <div style={{ marginTop: 12 }}>
                          {order.items.map(i => (
                            <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0' }}>
                              <span>{i.name} ×{i.qty}</span>
                              <span className="mono">₹{i.price * i.qty}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <TicketNotches bg="#1C1A17" />
                      <div style={{ background: '#F2E7D3', color: '#1C1A17', borderRadius: '0 0 16px 16px', padding: '4px 20px 18px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: '#8A7E64', padding: '4px 0' }}>
                          <span>Subtotal</span><span className="mono">₹{order.total}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: '#8A7E64', padding: '4px 0' }}>
                          <span>GST (5%)</span><span className="mono">₹{tax}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15, padding: '8px 0 0', borderTop: '1px dashed #C9BC9E', marginTop: 6 }}>
                          <span>Total</span><span className="mono">₹{grand}</span>
                        </div>
                        {order.paymentStatus === 'Pending' && (
                          <button onClick={() => payOrder(order.id)} style={{
                            width: '100%', marginTop: 14, padding: '11px 0', borderRadius: 9, border: 'none',
                            background: '#1C1A17', color: '#F2E7D3', fontWeight: 700, fontSize: 13,
                          }}>Pay now</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      <footer style={{ borderTop: '1px solid #3A352E', padding: '18px 20px', textAlign: 'center', fontSize: 11.5, color: '#6E665A' }}>
        Coal &amp; Clay · Open 12:00 PM – 11:30 PM · Jaipur, Rajasthan
      </footer>
    </div>
  );
}
