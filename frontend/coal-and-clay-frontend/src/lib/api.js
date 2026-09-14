// Small fetch wrapper shared by all three dashboards.
// Base URL comes from VITE_API_URL (see .env.example), defaults to localhost:4000.

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function authHeaders() {
  const token = localStorage.getItem('cc_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, { method = 'GET', body, auth = false } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? authHeaders() : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : null;

  if (!res.ok) {
    throw new Error(data?.error || `Request failed: ${res.status}`);
  }
  return data;
}

export const api = {
  // auth
  signup: (payload) => request('/api/auth/signup', { method: 'POST', body: payload }),
  login: (payload) => request('/api/auth/login', { method: 'POST', body: payload }),
  sendOtp: (phone) => request('/api/auth/otp/send', { method: 'POST', body: { phone } }),
  verifyOtp: (phone, code) => request('/api/auth/otp/verify', { method: 'POST', body: { phone, code } }),

  // menu
  getMenu: () => request('/api/menu'),
  setMenuAvailability: (id, available) =>
    request(`/api/menu/${id}/availability`, { method: 'PATCH', body: { available } }),

  // ingredients
  getIngredients: () => request('/api/ingredients'),
  restockIngredient: (id, amount) =>
    request(`/api/ingredients/${id}/restock`, { method: 'PATCH', body: amount ? { amount } : {} }),
  setIngredientStock: (id, stock) =>
    request(`/api/ingredients/${id}/stock`, { method: 'PATCH', body: { stock } }),

  // orders
  createOrder: (payload) => request('/api/orders', { method: 'POST', body: payload, auth: true }),
  getOrders: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/orders${qs ? `?${qs}` : ''}`);
  },
  updateOrderStatus: (id, status) =>
    request(`/api/orders/${id}/status`, { method: 'PATCH', body: { status } }),
  updateOrderPriority: (id, priority) =>
    request(`/api/orders/${id}/priority`, { method: 'PATCH', body: { priority } }),
  createPaymentOrder: (id) => request(`/api/orders/${id}/create-payment`, { method: 'POST' }),
verifyPayment: (id, payload) => request(`/api/orders/${id}/verify-payment`, { method: 'POST', body: payload }),
  payOrder: (id) =>
    request(`/api/orders/${id}/payment`, { method: 'PATCH', body: { paymentStatus: 'Paid' } }),

  // analytics
  getSalesAnalytics: (range = 'today') => request(`/api/analytics/sales?range=${range}`),
  getPeakHours: (range = 'week') => request(`/api/analytics/peak-hours?range=${range}`),

  // tables & staff
  getTables: () => request('/api/tables'),
  updateTable: (id, payload) => request(`/api/tables/${id}`, { method: 'PATCH', body: payload }),
  getStaff: () => request('/api/staff'),
};

export function saveSession(user, token) {
  localStorage.setItem('cc_token', token);
  localStorage.setItem('cc_user', JSON.stringify(user));
}
export function clearSession() {
  localStorage.removeItem('cc_token');
  localStorage.removeItem('cc_user');
}
export function getSession() {
  const token = localStorage.getItem('cc_token');
  const raw = localStorage.getItem('cc_user');
  return token && raw ? { token, user: JSON.parse(raw) } : null;
}

// Turns a raw MenuItem (with `ingredients: [{ qtyPerOrder, ingredient }]`) into
// the shape the dashboards render, deriving a live "portions left" count from
// ingredient stock instead of a separately-tracked field.
export function withDerivedStock(menuItem) {
  if (!menuItem.available) return { ...menuItem, stock: 0 };
  if (!menuItem.ingredients || menuItem.ingredients.length === 0) return { ...menuItem, stock: 99 };
  const portions = Math.min(
    ...menuItem.ingredients.map((link) => Math.floor(link.ingredient.stock / link.qtyPerOrder))
  );
  return { ...menuItem, stock: Math.max(0, portions) };
}
