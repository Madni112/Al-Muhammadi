import React, { useRef, useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import SidebarLinkGroup from './SidebarLinkGroup';
import { AiOutlineUp, AiOutlineDown, AiOutlineRight, AiOutlineArrowLeft } from 'react-icons/ai';
import { LuLogOut } from 'react-icons/lu';
import { useModal } from '../../Context/Modal';
import { useAuth } from '../../Context/Auth';
import LogoDark from '../../images/logo/logo-dark.png';
import LogoLight from '../../images/logo/logo-light.png';
import IconDark from '../../images/logo/icon-dark.png';
import IconLight from '../../images/logo/icon-light.png';
import { Weight } from 'lucide-react';

interface SidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (arg: boolean) => void;
}

const FlyoutSubMenu = ({ item, pathname, handleLinkClick, getTenantPath }: any) => {
  const [showSubFlyout, setShowSubFlyout] = useState(false);

  if (item.children) {
    return (
      <li
        className="relative"
        onMouseEnter={() => setShowSubFlyout(true)}
        onMouseLeave={() => setShowSubFlyout(false)}
      >
        <div className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs font-medium duration-150 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer pr-4">
          <div className="flex items-center gap-2 truncate">
            {item.icon && <item.icon className="text-sm shrink-0" />}
            <span className="truncate">{item.label}</span>
          </div>
          <AiOutlineRight size={10} className="shrink-0 text-slate-400" />
        </div>

        {showSubFlyout && (
          <div
            className="absolute left-full top-0 -ml-1.5 z-99999 w-52 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#1E293B]/95 p-2 shadow-2xl backdrop-blur-md"
            style={{ animation: 'sidebarFlyoutFadeIn 0.15s ease-out forwards' }}
          >
            <div className="absolute top-0 -left-3 w-3 h-full bg-transparent" />
            <ul className="flex flex-col gap-1">
              {item.children.map((child: any, idx: number) => (
                <FlyoutSubMenu
                  key={idx}
                  item={child}
                  pathname={pathname}
                  handleLinkClick={handleLinkClick}
                  getTenantPath={getTenantPath}
                />
              ))}
            </ul>
          </div>
        )}
      </li>
    );
  }

  const destination = (item.path && getTenantPath ? getTenantPath(item.path) : item.path) || '#';
  const isActive = pathname === destination || pathname === item.path;

  return (
    <li>
      <NavLink
        to={destination}
        onClick={handleLinkClick}
        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium duration-150 ${
          isActive
            ? 'text-red-600 bg-red-50/80 dark:bg-red-500/15 dark:text-red-400 font-semibold'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800'
        }`}
      >
        {item.icon && <item.icon className="text-sm shrink-0" />}
        <span>{item.label}</span>
      </NavLink>
    </li>
  );
};

const SidebarItem = ({ item, pathname, depth = 0, sidebarOpen, setSidebarOpen, hideModal, openMenuId, setOpenMenuId, menuUniqueKey, getTenantPath }: any) => {
  const itemRef = useRef<HTMLDivElement>(null);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [showFlyout, setShowFlyout] = useState(false);
  const [flyoutTop, setFlyoutTop] = useState<number>(0);

  // Helper check: Recursively verifies if any nested children match the active route URL
  const checkHasActiveChild = (routeItem: any): boolean => {
    if (!routeItem) return false;
    if (!routeItem.children || !Array.isArray(routeItem.children)) return false;

    return routeItem.children.some((child: any) => {
      const dest = child.path && getTenantPath ? getTenantPath(child.path) : child.path;
      const cleanChildPath = String(child.path || '').toLowerCase();
      const cleanDest = String(dest || '').toLowerCase();
      const cleanPathname = String(pathname || '').toLowerCase();

      if (cleanChildPath && (cleanPathname === cleanChildPath || cleanPathname === cleanDest)) return true;

      // Match sub-routes (e.g., /Add, /Edit, /Print, /customer-details) of this child
      const baseChild = cleanChildPath.replace(/\/(list|customer-details|add)$/i, '');
      if (baseChild && baseChild.length > 2 && cleanPathname.includes(baseChild)) {
        return true;
      }

      if (child.children) return checkHasActiveChild(child);
      return false;
    });
  };

  const itemDestination = item?.path && getTenantPath ? getTenantPath(item.path) : (item?.path || '');
  const isChildActive = checkHasActiveChild(item) || Boolean(item?.path && (pathname === item.path || pathname === itemDestination));

  // Local toggle state initializes accurately based on the active path to support hard refreshes
  const [open, setOpen] = useState(isChildActive);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Sync active route ONLY when pathname changes
  useEffect(() => {
    if (isChildActive) {
      setOpen(true);
      if (depth === 0) setOpenMenuId(menuUniqueKey);
    }
  }, [pathname, isChildActive, depth, menuUniqueKey, setOpenMenuId]);

  // Closes other parent groups if a completely different parent node section is selected
  useEffect(() => {
    if (depth === 0 && openMenuId !== menuUniqueKey && !isChildActive) {
      setOpen(false);
    }
  }, [openMenuId, menuUniqueKey, depth, isChildActive]);

  const isMobile = windowWidth <= 750;
  const shouldShowLabels = sidebarOpen || isMobile;

  const handleLinkClick = () => {
    if (isMobile) {
      setSidebarOpen(false);
    }
    hideModal();
    setShowFlyout(false);
  };

  const handleMouseEnter = () => {
    if (!sidebarOpen && itemRef.current && !isMobile) {
      const rect = itemRef.current.getBoundingClientRect();
      setFlyoutTop(rect.top);
      setShowFlyout(true);
    }
  };

  if (item.children) {
    return (
      <div
        ref={itemRef}
        className="w-full"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => !sidebarOpen && !isMobile && setShowFlyout(false)}
      >
        <SidebarLinkGroup activeCondition={isChildActive}>
          {(handleClick, isGroupOpen) => (
            <>
              <NavLink
                to="#"
                className={`group relative flex items-center rounded-xl py-2.5 font-medium duration-200 ease-in-out ${
                  isChildActive && shouldShowLabels
                    ? 'text-red-600 dark:text-red-400 bg-red-50/80 dark:bg-red-500/15 font-semibold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800'
                } ${shouldShowLabels ? 'px-3.5 justify-start' : 'justify-center mx-auto w-10 h-10 px-0'}`}
                style={{ paddingLeft: shouldShowLabels ? `${(depth + 1) * 0.85}rem` : undefined }}
                onClick={(e) => {
                  e.preventDefault();
                  const nextState = !open;
                  setOpen(nextState);
                  if (nextState && depth === 0) {
                    setOpenMenuId(menuUniqueKey);
                  } else if (!nextState && depth === 0 && openMenuId === menuUniqueKey) {
                    setOpenMenuId(null);
                  }
                  handleClick();
                }}
              >
                {item.icon && <item.icon className={`text-lg shrink-0 ${isChildActive ? 'text-red-600 dark:text-red-400' : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'}`} />}
                {shouldShowLabels && (
                  <>
                    <span className="text-xs font-medium ml-2.5 whitespace-nowrap overflow-hidden text-ellipsis flex flex-col gap-1 tracking-wide">
                      {item.label}
                    </span>
                    <span className="ml-auto text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-transform duration-200">
                      {open ? <AiOutlineUp size={11} /> : <AiOutlineDown size={11} />}
                    </span>
                  </>
                )}
              </NavLink>

              {/* Collapsible Sub-item Drawer */}
              {shouldShowLabels && (
                <div
                  className="transition-all duration-300 ease-in-out overflow-hidden transform pl-3 ml-2 border-l border-slate-200/80 dark:border-slate-800"
                  style={{
                    maxHeight: open ? '1000px' : '0px',
                    opacity: open ? '100' : '0',
                    marginTop: open ? '4px' : '0px',
                    marginBottom: open ? '4px' : '0px',
                    pointerEvents: open ? 'auto' : 'none'
                  }}
                >
                  <ul className="flex flex-col gap-1 py-1">
                    {item.children.map((child: any, idx: number) => (
                      <SidebarItem
                        key={idx}
                        item={child}
                        pathname={pathname}
                        depth={depth + 1}
                        sidebarOpen={sidebarOpen}
                        setSidebarOpen={setSidebarOpen}
                        hideModal={hideModal}
                        openMenuId={openMenuId}
                        setOpenMenuId={setOpenMenuId}
                        menuUniqueKey={`${menuUniqueKey}-${idx}`}
                        getTenantPath={getTenantPath}
                      />
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </SidebarLinkGroup>

        {!sidebarOpen && showFlyout && !isMobile && (
          <div
            className="fixed left-[56px] z-99999 w-56 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#1E293B]/95 p-2.5 shadow-2xl backdrop-blur-md"
            style={{
              top: `${flyoutTop}px`,
              animation: 'sidebarFlyoutFadeIn 0.18s ease-out forwards'
            }}
          >
            <style>{`
              @keyframes sidebarFlyoutFadeIn {
                from { opacity: 0; transform: translateX(-6px); }
                to { opacity: 1; transform: translateX(0); }
              }
            `}</style>
            <div className="px-3 py-1.5 mb-1.5 border-b border-slate-100 dark:border-slate-800 font-bold text-[10px] text-red-600 dark:text-red-400 uppercase tracking-wider text-left">
              {item.label}
            </div>
            <ul className="flex flex-col gap-1">
              {item.children.map((child: any, idx: number) => (
                <FlyoutSubMenu key={idx} item={child} pathname={pathname} handleLinkClick={handleLinkClick} getTenantPath={getTenantPath} />
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  const singleDestination = (item.path && getTenantPath ? getTenantPath(item.path) : item.path) || '#';
  const isDirectActive = item.path && (pathname === singleDestination || pathname === item.path);

  return (
    <li onClick={handleLinkClick} className="w-full" title={!shouldShowLabels ? item.label : undefined}>
      <NavLink
        to={singleDestination}
        className={`group relative flex items-center rounded-xl py-2.5 font-medium duration-200 ease-in-out ${
          isDirectActive
            ? 'text-emerald-600 bg-emerald-50/80 dark:bg-emerald-500/15 dark:text-emerald-400 font-semibold shadow-xs'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800'
        } ${shouldShowLabels ? 'px-3.5 justify-start' : 'justify-center mx-auto w-10 h-10 px-0'}`}
        style={{ paddingLeft: shouldShowLabels ? `${(depth + 1) * 0.85}rem` : undefined }}
      >
        {item.icon && <item.icon className={`text-lg shrink-0 ${isDirectActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'}`} />}
        {shouldShowLabels && <span className="text-xs font-medium ml-2.5 whitespace-nowrap overflow-hidden text-ellipsis tracking-wide">{item.label}</span>}
      </NavLink>
    </li>
  );
};

const Sidebar = ({ sidebarOpen, setSidebarOpen }: SidebarProps) => {
  const { getRoleBasedRoutes, logout, tenantId } = useAuth();
  const roleRoutes = getRoleBasedRoutes();
  const location = useLocation();
  const { hideModal } = useModal();
  const { pathname } = location;
  const sidebar = useRef<any>(null);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  const isTenantRoute = pathname.startsWith('/tenant=') || pathname.startsWith('/tenant-');
  const rawTenant = tenantId || (isTenantRoute ? pathname.split('/')[1] : '');
  const cleanSlug = rawTenant ? rawTenant.replace(/^tenant=/, '').replace(/^tenant-/, '').toLowerCase().trim() : '';
  const reservedPrefixes = ['auth', 'dev', 'assets', 'api', 'purchase', 'sales', 'reports', 'registration', 'administration', 'dashboard', 'sales-return'];
  const cleanPrefix = cleanSlug && !reservedPrefixes.includes(cleanSlug) ? `/${cleanSlug}` : '';

  const getTenantPath = (path?: string) => {
    if (!path || typeof path !== 'string') return '';
    if (!cleanPrefix) return path;
    if (path === '/') return cleanPrefix;
    const cleanSub = path.startsWith('/') ? path : `/${path}`;
    return `${cleanPrefix}${cleanSub}`;
  };

  // Master tracking ID to determine which global branch header is clicked open
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = windowWidth <= 750;

  return (
    <>
      {isMobile && sidebarOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-9999 backdrop-blur-xs transition-opacity duration-300" onClick={() => setSidebarOpen(false)} />
      )}

      <aside ref={sidebar} className={`fixed left-0 top-0 z-99999 flex h-screen flex-col bg-white duration-300 ease-in-out dark:bg-[#111827] shadow-xl ${isMobile ? 'block' : 'min-[751px]:sticky min-[751px]:top-0'} ${sidebarOpen ? 'w-72.5 translate-x-0 border-r border-slate-200/80 dark:border-slate-800/80 visible' : 'w-0 -translate-x-full min-[751px]:w-18 min-[751px]:translate-x-0 min-[751px]:border-r min-[751px]:border-slate-200/80 min-[751px]:dark:border-slate-800/80 max-[750px]:invisible'}`} >

        {/* Brand Header */}
        <div className={`flex items-center justify-between gap-2 py-5 border-b border-slate-200/80 dark:border-slate-800/80 min-h-[76px] duration-300 ${sidebarOpen ? 'px-6' : 'px-0 min-[751px]:px-2 justify-center'}`} >
          {(sidebarOpen || isMobile) ? (
            <div className="flex items-center justify-between w-full">
              <NavLink className="flex items-center gap-3.5 group" to="/">
                <div className="w-11 h-11 rounded-xl bg-red-600 flex items-center justify-center shadow-md shadow-red-600/30 group-hover:scale-105 transition-all duration-200 text-white font-black text-lg select-none shrink-0">
                  A
                </div>
                <div className="text-left">
                  <div className="text-[16px] font-black text-slate-900 dark:text-white tracking-tight leading-tight">
                    AL MUHAMMADI
                  </div>
                  <div className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 tracking-wider mt-0.5 uppercase">
                    ENTERPRISE ERP
                  </div>
                </div>
              </NavLink>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSidebarOpen(false);
                }}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors"
                title="Collapse Sidebar"
              >
                <AiOutlineArrowLeft size={18} />
              </button>
            </div>
          ) : (
            <div
              className="w-full flex justify-center cursor-pointer py-1"
              onClick={(e) => {
                e.stopPropagation();
                setSidebarOpen(true);
              }}
              title="Open Sidebar"
            >
              <div className="w-11 h-11 rounded-xl bg-red-600 flex items-center justify-center shadow-md shadow-red-600/30 hover:scale-105 transition-all duration-200 text-white font-black text-lg select-none">
                A
              </div>
            </div>
          )}
        </div>

        {/* Navigation Section */}
        <div className="no-scrollbar flex flex-col overflow-y-auto overflow-x-hidden flex-1">
          <nav className={`py-4 duration-300 ${sidebarOpen ? 'px-3' : 'px-0 min-[751px]:px-2'}`}>
            <ul className="mb-6 flex flex-col gap-1.5 w-full">
              {roleRoutes
                .filter((route: any) => !route.hideFromSidebar)
                .map((route: any, index: number) => (
                  <SidebarItem
                    key={index}
                    item={route}
                    pathname={pathname}
                    sidebarOpen={sidebarOpen}
                    setSidebarOpen={setSidebarOpen}
                    hideModal={hideModal}
                    openMenuId={openMenuId}
                    setOpenMenuId={setOpenMenuId}
                    menuUniqueKey={`root-${index}`}
                    getTenantPath={getTenantPath}
                  />

                ))
              }
              <li 
                className={`group relative flex items-center rounded-xl py-2.5 font-medium text-slate-600 dark:text-slate-300 duration-200 ease-in-out hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 cursor-pointer mt-4 border-t border-slate-200/80 dark:border-slate-800 pt-4 ${sidebarOpen ? 'justify-start px-3.5' : 'justify-center mx-auto w-10 h-10 px-0'}`} 
                onClick={() => logout()} 
                title={!sidebarOpen ? 'LogOut' : undefined} 
              >
                <LuLogOut className="text-lg shrink-0 text-slate-400 group-hover:text-rose-600 dark:group-hover:text-rose-400" />
                {(sidebarOpen || isMobile) && <span className="ml-3 text-xs font-semibold">Log Out</span>}
              </li>
            </ul>
          </nav>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
