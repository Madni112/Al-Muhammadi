import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ClickOutside from '../ClickOutside';
import { LuLogOut, LuBuilding2, LuMail } from 'react-icons/lu';
import { MdPerson } from 'react-icons/md';
import { useAuth, detectPortalTenant } from '../../Context/Auth';
import { supabase } from '../../Context/supabaseClient';

const DropdownUser = () => {
  const { logout, businessName: authBusinessName, userEmail, role, currentUser } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [profile, setProfile] = useState<any>();
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (user) {
      try {
        setProfile(JSON.parse(user));
      } catch (_) {}
    }
  }, []);

  const Logout = () => {
    logout();
  };

  const displayEmail = userEmail || profile?.email || 'admin@almuhammadi.com';
  const displayRole = role || profile?.role || 'Super Admin';
  const displayCompanyName = 'AL MUHAMMADI';
  const displayName = profile?.user_metadata?.full_name || profile?.user_metadata?.name || displayCompanyName;

  return (
    <ClickOutside onClick={() => setDropdownOpen(false)} className="relative z-9999">
      <Link
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="flex items-center gap-3.5 cursor-pointer select-none"
        to="#"
      >
        <span className="hidden text-right lg:block">
          <span className="block text-sm font-black text-black dark:text-white truncate max-w-[200px]">
            {displayCompanyName}
          </span>
          <span className="block text-xs font-semibold text-red-600 dark:text-red-400">
            {displayRole}
          </span>
        </span>

        {profile?.image && !imageError ? (
          <img
            className="w-9 h-9 border object-cover rounded-full"
            src={profile.image}
            onError={() => setImageError(true)}
            alt="User"
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-red-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
            <MdPerson size={20} />
          </div>
        )}

        <svg
          className="hidden fill-current sm:block"
          width="12"
          height="8"
          viewBox="0 0 12 8"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M0.410765 0.910734C0.736202 0.585297 1.26384 0.585297 1.58928 0.910734L6.00002 5.32148L10.4108 0.910734C10.7362 0.585297 11.2638 0.585297 11.5893 0.910734C11.9147 1.23617 11.9147 1.76381 11.5893 2.08924L6.58928 7.08924C6.26384 7.41468 5.7362 7.41468 5.41077 7.08924L0.410765 2.08924C0.0853277 1.76381 0.0853277 1.23617 0.410765 0.910734Z"
            fill=""
          />
        </svg>
      </Link>

      {/* <!-- Dropdown Start --> */}
      {dropdownOpen && (
        <div
          className="absolute right-0 mt-3 flex w-72 flex-col rounded-lg border border-stroke bg-white shadow-2xl dark:border-strokedark dark:bg-boxdark z-99999 overflow-hidden"
          style={{ zIndex: 99999 }}
        >
          {/* Client Company Name & Details (Above Log Out) */}
          <div className="px-5 py-3.5 bg-gray-50/90 dark:bg-meta-4/60 border-b border-stroke dark:border-strokedark">
            <div className="flex items-center gap-1.5 mb-1 text-primary">
              <LuBuilding2 size={15} />
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Company / Organization
              </span>
            </div>
            
            <h4 className="text-sm font-bold text-black dark:text-white truncate" title={displayCompanyName}>
              {displayCompanyName}
            </h4>

            <div className="mt-2 flex items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400 pt-1 border-t border-stroke/50 dark:border-strokedark/50">
              <span className="truncate flex items-center gap-1" title={displayEmail}>
                <LuMail size={12} className="shrink-0" />
                {displayEmail}
              </span>
              <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary dark:bg-primary/20 uppercase">
                {displayRole}
              </span>
            </div>
          </div>

          {/* Action List / Log Out */}
          <div className="p-2">
            <button
              onClick={Logout}
              className="flex items-center gap-3 w-full px-3.5 py-2.5 rounded-md text-sm font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition duration-150 ease-in-out cursor-pointer"
            >
              <LuLogOut size={16} />
              <span>Log Out</span>
            </button>
          </div>
        </div>
      )}
      {/* <!-- Dropdown End --> */}
    </ClickOutside>
  );
};

export default DropdownUser;
