import DropdownUser from './DropdownUser';
import DarkModeSwitcher from './DarkModeSwitcher';
import NotificationDropdown from './NotificationDropdown';
import { MdMenu, MdShield, MdCloudDone } from 'react-icons/md';

const Header = (props: {
  sidebarOpen: string | boolean | undefined;
  setSidebarOpen: (arg0: boolean) => void;
}) => {
  return (
    <header className="sticky top-0 z-999 flex w-full backdrop-blur-md bg-white/90 dark:bg-[#0B0F17]/90 border-b border-slate-200/80 dark:border-slate-800/80 transition-all duration-200">
      <div className="flex flex-grow items-center justify-between px-4 py-3 md:px-6 2xl:px-8">
        
        {/* Left Side: Mobile Sidebar Toggle + Live Status Pill */}
        <div className="flex items-center gap-3">
          <button
            aria-controls="sidebar"
            onClick={(e) => {
              e.stopPropagation();
              props.setSidebarOpen(!props.sidebarOpen);
            }}
            className="z-99999 block rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1.5 shadow-sm min-[751px]:hidden text-slate-700 dark:text-slate-200 hover:text-red-600 transition"
          >
            <MdMenu size={22} />
          </button>

          <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60 text-xs font-semibold text-slate-600 dark:text-slate-300">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
            </span>
            <span className="text-[11px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider">ALMUHAMMADI</span>
            <span className="text-[10px] text-slate-400">•</span>
            <span className="text-[11px] font-medium tracking-wide">Portal Active</span>
          </div>
        </div>

        {/* Right Side: Tools & Profile */}
        <div className="flex items-center gap-3 2xsm:gap-4">
          <ul className="flex items-center gap-2">
            <NotificationDropdown />
            <DarkModeSwitcher />
          </ul>
          <div className="h-6 w-px bg-slate-200 dark:bg-slate-700" />
          <DropdownUser />
        </div>
      </div>
    </header>
  );
};

export default Header;