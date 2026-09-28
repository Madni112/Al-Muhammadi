import React from 'react';
import { MdPhone, MdWhatsapp, MdBusiness, MdShield, MdCloudDone } from 'react-icons/md';
import { useAuth } from '../../Context/Auth';

const Footer: React.FC = () => {
  const { businessName } = useAuth();
  const currentYear = new Date().getFullYear();

  return (
    <footer className="print:hidden w-full border-t border-slate-200/80 backdrop-blur-md bg-white/90 px-4 py-3.5 dark:border-slate-800 dark:bg-[#1E293B]/90 md:px-6 2xl:px-8 duration-200 transition-all">
      <div className="mx-auto flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        
        {/* Left: Company & Tenant Branding */}
        <div className="flex flex-wrap items-center gap-2.5 text-center md:text-left">
          <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
              <MdBusiness size={13} />
            </span>
            <span className="font-extrabold tracking-wide uppercase text-xs">AL MUHAMMADI</span>
          </div>

          {businessName && (
            <span className="hidden sm:inline-flex items-center rounded-lg bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              {businessName}
            </span>
          )}

          <span className="hidden lg:inline text-slate-300 dark:text-slate-700">•</span>
          <span className="hidden lg:inline text-slate-500 dark:text-slate-400 text-[11px]">
            AL MUHAMMADI
          </span>
        </div>

        {/* Center: System Status Indicator */}
        <div className="flex items-center gap-3 font-medium text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Cloud Synced
          </span>
          <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
            <MdShield size={13} className="text-emerald-500" /> Enterprise Secure
          </span>
        </div>

        {/* Right: Contact Hotline & Quick WhatsApp Actions */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 font-bold text-xs">
            <span className="text-slate-400 dark:text-slate-500 font-normal">Hotline:</span>
            <a
              href="tel:03128039911"
              className="flex items-center gap-1 font-extrabold text-emerald-600 dark:text-emerald-400 hover:underline transition"
              title="Call Support Hotline"
            >
              <MdPhone size={13} />
              <span>03128039911</span>
            </a>
          </div>

          <a
            href="https://wa.me/923128039911"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg bg-[#25D366]/10 px-2.5 py-1 text-[11px] font-bold text-[#25D366] hover:bg-[#25D366] hover:text-white transition duration-150 border border-[#25D366]/20"
            title="Chat on WhatsApp"
          >
            <MdWhatsapp size={13} />
            <span className="hidden sm:inline">WhatsApp</span>
          </a>
        </div>

      </div>

      {/* Bottom Sub-line */}
      <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/60 flex flex-col sm:flex-row items-center justify-between text-[10px] text-slate-400 dark:text-slate-500">
        <span>© {currentYear} AL MUHAMMADI. All rights reserved.</span>
        <span className="font-mono">v1.3.8 • Secure Business Management Infrastructure</span>
      </div>
    </footer>
  );
};

export default Footer;
