import { useState, useEffect } from 'react';
import CustomerAuth from './CustomerAuth';
import RestaurantDashboard from './RestaurantDashboard';
import KitchenDashboard from './KitchenDashboard';
import OwnerDashboard from './OwnerDashboard';
import { getSession } from './lib/api';

// Coal & Clay ships as one codebase with three "frontends" (customer, kitchen,
// owner) that each run on their own Vite dev server/port so they can be
// opened side by side — see package.json (dev:customer/dev:kitchen/dev:owner)
// and docker-compose.yml. Which dashboard renders is decided by:
//   1. VITE_APP_ROLE at build time (set per docker-compose service), or
//   2. the dev port convention (5173 customer / 5174 kitchen / 5175 owner), or
//   3. a ?role= query param, handy for quickly previewing the others.
function resolveRole() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('role')) return params.get('role');
  if (import.meta.env.VITE_APP_ROLE) return import.meta.env.VITE_APP_ROLE;
  const port = window.location.port;
  if (port === '5174') return 'kitchen';
  if (port === '5175') return 'owner';
  return 'customer';
}

function App() {
  const [role] = useState(resolveRole);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    if (role === 'customer' && getSession()) setLoggedIn(true);
  }, [role]);

  if (role === 'kitchen') return <KitchenDashboard />;
  if (role === 'owner') return <OwnerDashboard />;

  if (!loggedIn) {
    return <CustomerAuth onAuthed={() => setLoggedIn(true)} />;
  }
  return <RestaurantDashboard />;
}

export default App;
