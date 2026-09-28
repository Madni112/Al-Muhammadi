import React from 'react';
import { NavLink } from 'react-router-dom';
import IconDark from '../../images/logo/icon-dark.png';
import {
  MdSpeed,
  MdQrCodeScanner,
  MdCheckCircle,
  MdLayers,
  MdArrowForward,
  MdLock,
  MdAutoGraph,
  MdShield
} from 'react-icons/md';

const CompanyLanding: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#070A10] text-slate-100 font-sans flex flex-col selection:bg-emerald-600 selection:text-white relative overflow-hidden">
      {/* Ambient background glow mesh - Emerald & Teal */}
      <div className="pointer-events-none absolute top-[-10%] left-[20%] w-[600px] h-[500px] bg-emerald-600/15 rounded-full blur-[140px]" />
      <div className="pointer-events-none absolute top-[30%] right-[-10%] w-[500px] h-[450px] bg-teal-600/10 rounded-full blur-[130px]" />

      {/* NAVBAR */}
      <nav className="border-b border-slate-800/80 bg-[#0B0F17]/85 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-xl bg-emerald-600/10 border border-emerald-500/20 shadow-sm">
              <img src={IconDark} alt="NHT Logo" className="h-8 sm:h-9 w-auto" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 font-black text-base sm:text-lg tracking-tight">
                <span className="text-red-500">AL MUHAMMADI</span>
              </div>
              <p className="text-[9px] sm:text-[10px] text-slate-400 font-semibold tracking-wider uppercase">
                Enterprise Invoicing & Accounting Platform
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-400">
              <span className="hover:text-white transition cursor-pointer">Platform</span>
              <span className="hover:text-white transition cursor-pointer">Digital Invoicing</span>
              <span className="hover:text-white transition cursor-pointer">Support</span>
            </div>
            <NavLink
              to="/signin"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-lg shadow-red-600/25 hover:shadow-red-600/40 transition duration-200"
            >
              <span>Client Portal</span>
              <MdArrowForward />
            </NavLink>
          </div>
        </div>
      </nav>

      {/* HERO SECTION */}
      <main className="flex-1 max-w-6xl mx-auto px-6 py-16 sm:py-24 flex flex-col items-center justify-center text-center relative z-10">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold shadow-inner mb-6">
          <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse"></span>
          AL Muhammadi • Corporate Management Suite
        </div>

        <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-white leading-tight max-w-4xl">
          Empowering Enterprises with <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 via-rose-300 to-amber-300">Intelligent Digital Systems</span>
        </h1>

        <p className="text-slate-400 text-base sm:text-lg max-w-2xl mt-6 leading-relaxed">
          AL Muhammadi delivers next-generation resource planning, computerized distribution accounting, inventory lifecycle tracking, and instant fiscal synchronization.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-4 mt-8">
          <NavLink
            to="/bashir/signin"
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm shadow-xl shadow-emerald-600/25 hover:shadow-emerald-600/45 hover:-translate-y-0.5 transition duration-200"
          >
            <span>Access Portal</span>
            <MdArrowForward size={18} />
          </NavLink>
          <a
            href="https://wa.me/923128039911"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 font-bold text-sm border border-slate-800 hover:border-emerald-500/40 transition duration-200"
          >
            <span>Contact Hotline</span>
          </a>
        </div>

        {/* SOLUTIONS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full pt-16 text-left">
          
          <div className="bg-[#0F1622]/90 backdrop-blur-md p-6 sm:p-7 rounded-2xl border border-slate-800 hover:border-emerald-500/40 transition duration-300 shadow-xl hover:-translate-y-1 group">
            <div className="w-12 h-12 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
              <MdLayers />
            </div>
            <h3 className="text-base font-bold text-white mt-4">Enterprise Architecture</h3>
            <p className="text-xs text-slate-400 leading-relaxed mt-2">
              Complete inventory controls, procurement workflows, automated sales invoices, delivery challans, and real-time financial balance sheets.
            </p>
          </div>

          <div className="bg-[#0F1622]/90 backdrop-blur-md p-6 sm:p-7 rounded-2xl border border-slate-800 hover:border-teal-500/40 transition duration-300 shadow-xl hover:-translate-y-1 group">
            <div className="w-12 h-12 rounded-xl bg-teal-600/20 text-teal-400 border border-teal-500/30 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
              <MdQrCodeScanner />
            </div>
            <h3 className="text-base font-bold text-white mt-4">Smart Digital Invoicing</h3>
            <p className="text-xs text-slate-400 leading-relaxed mt-2">
              Automated sales invoices, delivery challans, instant barcode generation, and synchronized client ledger records.
            </p>
          </div>

          <div className="bg-[#0F1622]/90 backdrop-blur-md p-6 sm:p-7 rounded-2xl border border-slate-800 hover:border-amber-500/40 transition duration-300 shadow-xl hover:-translate-y-1 group">
            <div className="w-12 h-12 rounded-xl bg-amber-600/20 text-amber-400 border border-amber-500/30 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
              <MdAutoGraph />
            </div>
            <h3 className="text-base font-bold text-white mt-4">Multi-Branch Analytics</h3>
            <p className="text-xs text-slate-400 leading-relaxed mt-2">
              Automated customer recovery tracking, warehouse-to-showroom stock transfers, and executive business analysis reports.
            </p>
          </div>

        </div>

        {/* TRUST BADGES */}
        <div className="pt-14 flex flex-wrap justify-center items-center gap-6 sm:gap-8 text-slate-400 text-xs font-semibold">
          <span className="flex items-center gap-2"><MdCheckCircle className="text-emerald-400 text-base" /> Dedicated Tenant Isolation</span>
          <span className="flex items-center gap-2"><MdShield className="text-teal-400 text-base" /> Enterprise Security Protocol</span>
          <span className="flex items-center gap-2"><MdLock className="text-amber-400 text-base" /> 99.9% Uptime SLA</span>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-slate-900 bg-[#05070C] py-8 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>© {new Date().getFullYear()} AL Muhammadi. All Rights Reserved.</span>
          <span className="font-mono text-[11px] text-slate-600">Enterprise Cloud Infrastructure v1.3.8</span>
        </div>
      </footer>
    </div>
  );
};

export default CompanyLanding;
