import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import * as RoleRoutes from '../Navigation/Roles';
import { UserRole } from '../constant/auth';
import { getModulesForRole, ROLE_PRESETS } from '../constant/roles';
import { toast } from 'react-hot-toast';

interface AuthContextType {
  isAuthenticated: boolean;
  role: string | null;
  tenantId: string | null;
  businessName: string | null;
  userEmail: string | null;
  userLocationId: string | number | null;
  userLocationName: string | null;
  userName?: string | null;
  currentUser: any;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  getRoleBasedRoutes: () => any[];
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Detects any legacy portal slug if present in URL.
 */
export const detectPortalTenant = (): string | null => {
  return null;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      return localStorage.getItem('zac_is_authenticated') === 'true';
    } catch (_) {
      return false;
    }
  });
  const [role, setRole] = useState<string | null>(() => {
    try {
      return localStorage.getItem('zac_user_role') || 'Super Admin';
    } catch (_) {
      return 'Super Admin';
    }
  });
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState<string | null>('Zoaib Ali & Company');
  const [userEmail, setUserEmail] = useState<string | null>(() => {
    try {
      return localStorage.getItem('zac_user_email') || null;
    } catch (_) {
      return null;
    }
  });
  const [userLocationId, setUserLocationId] = useState<string | number | null>(() => {
    try {
      return localStorage.getItem('zac_user_location_id') || null;
    } catch (_) {
      return null;
    }
  });
  const [userLocationName, setUserLocationName] = useState<string | null>(() => {
    try {
      return localStorage.getItem('zac_user_location_name') || null;
    } catch (_) {
      return null;
    }
  });
  const [userName, setUserName] = useState<string | null>(() => {
    try {
      return localStorage.getItem('zac_user_name') || null;
    } catch (_) {
      return null;
    }
  });
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(() => {
    // If we have cached auth status, don't block the router with a full screen loader on refresh
    try {
      return localStorage.getItem('zac_is_authenticated') !== 'true';
    } catch (_) {
      return true;
    }
  });
  const navigate = useNavigate();

  // Initialize allowedModules
  const [allowedModules, setAllowedModules] = useState<string[] | null>(() => {
    try {
      const cached = localStorage.getItem('zac_user_modules');
      if (cached) return JSON.parse(cached);
    } catch (_) {}
    return ROLE_PRESETS['Super Admin'].modules;
  });

  const handleSessionExpired = (showToast = true) => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    setUserEmail(null);
    setTenantId(null);
    setUserName(null);
    setUserLocationId(null);
    setUserLocationName(null);

    try {
      localStorage.removeItem('zac_is_authenticated');
      localStorage.removeItem('zac_user_role');
      localStorage.removeItem('zac_user_email');
      localStorage.removeItem('zac_user_name');
      localStorage.removeItem('zac_user_modules');
      localStorage.removeItem('zac_user_location_id');
      localStorage.removeItem('zac_user_location_name');
    } catch (_) {}

    if (window.location.pathname !== '/signin') {
      if (showToast) {
        toast.error('Your session has expired. Please sign in again.');
      }
      navigate('/signin');
    }
  };

  useEffect(() => {
    let isMounted = true;

    // Safety timeout: Never keep the app in loading state for more than 1.2s
    const safetyTimer = setTimeout(() => {
      if (isMounted) setLoading(false);
    }, 1200);

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error || !session) {
        if (localStorage.getItem('zac_is_authenticated') === 'true') {
          handleSessionExpired(true);
        }
      } else if (isMounted) {
        handleAuthState(session);
      }
      if (isMounted) setLoading(false);
    }).catch((err) => {
      console.error('Auth getSession error:', err);
      if (isMounted) setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'TOKEN_REFRESHED') {
        console.log('JWT Token auto-refreshed successfully');
      }
      if (event === 'SIGNED_OUT') {
        handleSessionExpired(false);
      } else if (session) {
        handleAuthState(session);
      }
      if (isMounted) setLoading(false);
    });

    // Auto-refresh JWT when user switches back to the ERP tab after inactivity
    const handleVisibilityOrFocus = async () => {
      if (document.visibilityState === 'visible') {
        try {
          const { data: { session }, error } = await supabase.auth.getSession();
          if (error || !session) {
            if (localStorage.getItem('zac_is_authenticated') === 'true') {
              handleSessionExpired(true);
            }
            return;
          }
          if (session) {
            // Check if JWT token is near expiry and refresh silently
            const expiresAt = session.expires_at || 0;
            const now = Math.floor(Date.now() / 1000);
            if (expiresAt - now < 300) { // Less than 5 mins remaining
              const { error: refreshErr } = await supabase.auth.refreshSession();
              if (refreshErr) {
                handleSessionExpired(true);
              }
            }
          }
        } catch (_) {}
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    return () => {
      isMounted = false;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
    };
  }, []);

  const handleAuthState = async (session: any) => {
    if (session && session.user) {
      const metadata = session.user.user_metadata || {};
      const appMetadata = session.user.app_metadata || {};
      const email = session.user.email || '';

      let userRole = metadata.role || appMetadata.role || 'Super Admin';
      let userPermissions: string[] | null = null;
      let locId: string | number | null = null;
      let locName: string | null = null;
      let empName: string | null = metadata.name || appMetadata.name || null;

      // 1. Try to fetch live permissions and role from tenants table by email
      try {
        if (email) {
          const { data: tenantRecord } = await supabase
            .from('tenants')
            .select('business_activity, allowed_modules, name, location_id')
            .ilike('email', email)
            .maybeSingle();

          if (tenantRecord) {
            if (tenantRecord.business_activity) userRole = tenantRecord.business_activity;
            if (tenantRecord.name) empName = tenantRecord.name;
            if (Array.isArray(tenantRecord.allowed_modules) && tenantRecord.allowed_modules.length > 0) {
              userPermissions = tenantRecord.allowed_modules;
            }
            if (tenantRecord.location_id) {
              locId = tenantRecord.location_id;
              // Fetch location name
              const { data: locData } = await supabase.from('inventory_locations').select('name').eq('id', locId).maybeSingle();
              if (locData) locName = locData.name;
            }
          }
        }
      } catch (err) {
        console.warn('Auth live tenant lookup note:', err);
      }

      // 2. Fallback to user metadata or role preset
      if (!userPermissions || userPermissions.length === 0) {
        userPermissions = metadata.allowed_modules || appMetadata.allowed_modules || getModulesForRole(userRole);
      }

      setIsAuthenticated(true);
      setCurrentUser(session.user);
      setUserEmail(email || null);
      setRole(userRole);
      setTenantId(null);
      setBusinessName('Zoaib Ali & Company');
      setAllowedModules(userPermissions);
      setUserLocationId(locId);
      setUserLocationName(locName);
      setUserName(empName);

      try {
        localStorage.setItem('zac_is_authenticated', 'true');
        localStorage.setItem('zac_user_role', userRole);
        if (email) localStorage.setItem('zac_user_email', email);
        if (empName) localStorage.setItem('zac_user_name', empName);
        if (locId) localStorage.setItem('zac_user_location_id', locId.toString());
        if (locName) localStorage.setItem('zac_user_location_name', locName);
        localStorage.setItem('zac_user_modules', JSON.stringify(userPermissions));
      } catch (_) {}
    } else {
      setIsAuthenticated(false);
      setCurrentUser(null);
      setUserEmail(null);
      setRole('Super Admin');
      setTenantId(null);
      setBusinessName('Zoaib Ali & Company');
      setUserLocationId(null);
      setUserLocationName(null);
      setUserName(null);
      setAllowedModules(ROLE_PRESETS['Super Admin'].modules);

      try {
        localStorage.removeItem('zac_is_authenticated');
        localStorage.removeItem('zac_user_role');
        localStorage.removeItem('zac_user_email');
        localStorage.removeItem('zac_user_name');
        localStorage.removeItem('zac_user_location_id');
        localStorage.removeItem('zac_user_location_name');
      } catch (_) {}
    }
  };

  const login = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    if (data.user) {
      await handleAuthState(data.session);
      try {
        await supabase.from('audit_logs').insert([{
          action_type: 'LOGIN',
          table_name: 'auth_users',
          performed_by: email,
          details: { email, event: 'User logged into ERP portal', timestamp: new Date().toISOString() }
        }]);
      } catch (_) {}
    }

    navigate('/');
  };

  const logout = async () => {
    try {
      const userEmail = localStorage.getItem('zac_user_email') || 'User';
      await supabase.from('audit_logs').insert([{
        action_type: 'LOGOUT',
        table_name: 'auth_users',
        performed_by: userEmail,
        details: { email: userEmail, event: 'User logged out of ERP portal', timestamp: new Date().toISOString() }
      }]);
    } catch (_) {}

    await supabase.auth.signOut();
    localStorage.removeItem('zac_is_authenticated');
    localStorage.removeItem('zac_user_role');
    localStorage.removeItem('zac_user_email');
    localStorage.removeItem('zac_user_modules');
    navigate('/signin');
  };

  const getRoleBasedRoutes = () => {
    let routes = RoleRoutes.adminRoutes;

    // Super Admin / Owner always gets unrestricted full route access
    if (role && role.toLowerCase().includes('admin')) {
      return routes;
    }

    // Determine current effective modules (from state or cached per tenant)
    let currentAllowed = allowedModules;
    if (!currentAllowed && typeof window !== 'undefined') {
      const portal = detectPortalTenant() || tenantId;
      if (portal) {
        try {
          const cached = localStorage.getItem(`nht_modules_${portal}`);
          if (cached) currentAllowed = JSON.parse(cached);
        } catch (_) {}
      }
    }

    if (currentAllowed && Array.isArray(currentAllowed)) {
      const lowerAllowed = currentAllowed.map(m => String(m).toLowerCase().trim());

      // Helper to check if a path matches either directly or via aliases
      const matchesPath = (p: string) => {
        if (!p) return false;
        const lp = p.toLowerCase().trim();
        if (lowerAllowed.includes(lp)) return true;

        // Route aliases mapping
        const aliases: Record<string, string[]> = {
          '/': ['dashboard', 'dashboards', '/dashboard/executive', '/', '/dashboard/salesman', '/dashboard/warehouse', 'salesman-dashboard', 'warehouse-dashboard'],
          'dashboard': ['/', 'dashboard', 'dashboards', '/dashboard/executive', '/dashboard/salesman', '/dashboard/warehouse'],
          '/dashboard/executive': ['dashboard', 'dashboards', '/', '/dashboard/executive'],
          '/dashboard/salesman': ['salesman-dashboard', '/dashboard/salesman', 'dashboards', 'dashboard', '/'],
          '/dashboard/warehouse': ['warehouse-dashboard', '/dashboard/warehouse', 'dashboards', 'dashboard', '/'],
          '/sales/invoicereceipt/list': ['/registration/invoicereceipt/list'],
          '/registration/invoicereceipt/list': ['/sales/invoicereceipt/list'],
          '/sales/sales-return/list': ['/sales-return/debit-notes/list'],
          '/sales-return/debit-notes/list': ['/sales/sales-return/list'],
          '/sales/customers/list': ['/customers/list'],
          '/customers/list': ['/sales/customers/list'],
          '/sales/salesman/list': ['/salesman/list'],
          '/salesman/list': ['/sales/salesman/list'],
          '/sales/delivery-challan/list': ['/delivery-challan/list'],
          '/delivery-challan/list': ['/sales/delivery-challan/list'],
          '/sales/invoice/list': ['/sales/invoice/list']
        };

        const mapped = aliases[lp];
        if (mapped && mapped.some(a => lowerAllowed.includes(a))) {
          return true;
        }

        return lowerAllowed.some(m => m.endsWith(lp) || lp.endsWith(m));
      };

      routes = routes
        .map((route: any) => {
          // 1. All hidden action, print, and sub-modal routes (hideFromSidebar: true) are always preserved for React Router
          if (route.hideFromSidebar) {
            return route;
          }

          const label = String(route.label || '').toLowerCase().trim();
          const routePath = String(route.path || '').toLowerCase().trim();

          // 2. Standalone pages (like Dashboard)
          if (routePath === '/' || label === 'dashboard' || label === 'dashboards') {
            const isAllowed =
              lowerAllowed.includes('dashboard') ||
              lowerAllowed.includes('dashboards') ||
              lowerAllowed.includes('/') ||
              lowerAllowed.includes('/dashboard/salesman') ||
              lowerAllowed.includes('/dashboard/warehouse') ||
              lowerAllowed.includes('salesman-dashboard') ||
              lowerAllowed.includes('warehouse-dashboard') ||
              lowerAllowed.some(m => m.includes('dashboard'));
            return isAllowed ? route : null;
          }

          // 3. Parent Categories with Children (Administration, Registration, Sales, Purchase, Reports)
          if (route.children && Array.isArray(route.children)) {
            // Filter sub-pages: check path, path with/without leading slash, and label
            const filteredChildren = route.children.filter((child: any) => {
              if (child.hideFromSidebar) return true;
              const childPath = String(child.path || '').toLowerCase().trim();
              const childLabel = String(child.label || '').toLowerCase().trim();

              const isMatch =
                matchesPath(childPath) ||
                lowerAllowed.includes(childLabel) ||
                lowerAllowed.some(m => m.includes(childLabel) || childLabel.includes(m));

              return isMatch;
            });

            // If at least one sub-page is permitted, render the parent category with ONLY allowed sub-pages
            if (filteredChildren.length > 0) {
              return { ...route, children: filteredChildren };
            }
            // If zero sub-pages are permitted under this category, hide the entire category header
            return null;
          }

          // Direct top-level action routes
          if (routePath) {
            return matchesPath(routePath) ? route : null;
          }

          return route;
        })
        .filter(Boolean);
    } else if (tenantId || detectPortalTenant()) {
      // If client tenant is known but permissions are still loading, default to minimal view + action routes
      return routes.filter((r: any) => r.hideFromSidebar || r.path === '/' || String(r.label).toLowerCase() === 'dashboard');
    }


    return routes;
  };

  return (
    <AuthContext.Provider value={{
      isAuthenticated,
      role,
      tenantId,
      businessName,
      userEmail,
      userLocationId,
      userLocationName,
      userName,
      currentUser,
      loading,
      login,
      logout,
      getRoleBasedRoutes,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
