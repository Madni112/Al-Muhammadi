import React, { useState } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import IconDark from '../../images/logo/icon-dark.png';
import IconLight from '../../images/logo/icon-light.png';
import Spinner from '../../ui/Spinner';
import { useAuth, detectPortalTenant } from '../../Context/Auth';
import DarkModeSwitcher from '../../components/Header/DarkModeSwitcher';
import { MdLockOutline } from 'react-icons/md';

import { Navigate } from 'react-router-dom';

const SignIn: React.FC = () => {
  const { login, currentUser, tenantId } = useAuth();
  const [loading, setLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Check active tenant slug if coming from a tenant link (e.g. /bashir/signin)
  const activeTenantSlug = detectPortalTenant();

  // If user is already authenticated with a valid Supabase User ID for this tenant, redirect to dashboard!
  const currentTenant = String(tenantId || '').toLowerCase().trim();
  if (currentUser?.id && currentTenant && activeTenantSlug && currentTenant === activeTenantSlug.toLowerCase().trim()) {
    return <Navigate to={`/${currentTenant}`} replace />;
  }


  // Formik validation schema for login
  const validationSchema = Yup.object({
    email: Yup.string()
      .email('Invalid email format')
      .required('Email is required'),
    password: Yup.string()
      .min(6, 'Password must be at least 6 characters')
      .required('Password is required'),
  });

  const formik = useFormik({
    initialValues: {
      email: '',
      password: '',
    },
    validationSchema,
    onSubmit: async (values) => {
      try {
        setLoading(true);
        setAuthError(null);
        await login(values.email, values.password);
      } catch (error: any) {
        setAuthError(error.message || 'An error occurred during sign in');
      } finally {
        setLoading(false);
      }
    },
  });

  return (
    <div className="bg-[#F8FAFC] dark:bg-[#070A10] min-h-screen flex flex-col font-sans selection:bg-emerald-600 selection:text-white relative overflow-hidden">
      {/* Ambient background light meshes */}
      <div className="pointer-events-none absolute top-[-10%] left-[20%] w-[500px] h-[400px] bg-emerald-500/10 dark:bg-emerald-600/15 rounded-full blur-[130px]" />
      <div className="pointer-events-none absolute bottom-[-10%] right-[15%] w-[450px] h-[350px] bg-teal-500/10 dark:bg-teal-600/10 rounded-full blur-[120px]" />

      {/* Header Bar */}
      <header className="w-full backdrop-blur-md bg-white/90 dark:bg-[#0B0F17]/90 border-b border-slate-200/80 dark:border-slate-800/80 sticky top-0 z-50">
        <div className="flex items-center justify-between px-4 py-3.5 md:px-6 2xl:px-11 max-w-7xl mx-auto w-full">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-800 flex items-center justify-center shadow-lg shadow-emerald-600/30 border border-emerald-400/40 relative overflow-hidden select-none shrink-0">
              <div className="absolute inset-0 bg-gradient-to-t from-transparent via-white/10 to-white/20 pointer-events-none" />
              <span className="relative z-10 font-cinzel font-black tracking-widest text-[15px] text-white dark:text-[#0B0F17] leading-none pl-0.5">
                ZAC
              </span>
            </div>
            <div className="flex items-center gap-1.5 leading-tight">
              <span className="text-[19px] font-black text-emerald-600 dark:text-emerald-400">ZOAIB ALI</span>
              <span className="text-[19px] font-black text-slate-800 dark:text-slate-100">& COMPANY</span>
            </div>
          </div>
          <ul className="flex items-center gap-2 m-0 list-none">
            <DarkModeSwitcher />
          </ul>
        </div>
      </header>

      {/* Main Content: Direct Sign In Form */}
      <div className="flex flex-1 justify-center items-center p-4 sm:p-6 relative z-10">
        <div className="w-full max-w-md bg-white dark:bg-[#0F1622] rounded-3xl shadow-xl border border-slate-200/80 dark:border-slate-800 p-8 sm:p-10 backdrop-blur-md">
          
          <div className="text-center mb-7">
            <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Sign In to Your Account
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
              Enterprise Employee Business Management System
            </p>
          </div>

          {/* Display Auth Errors */}
          {authError && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold text-center">
              {authError}
            </div>
          )}

          <form onSubmit={formik.handleSubmit} className="space-y-4">
            {/* Email Input */}
            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-200">Email Address</label>
              <input
                type="email"
                id="email"
                name="email"
                required
                placeholder="e.g. admin@company.com"
                className={`w-full rounded-xl border bg-slate-50/50 dark:bg-slate-900/80 py-3 px-4 text-xs text-slate-800 dark:text-slate-100 outline-none transition duration-150 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 ${
                  formik.touched.email && formik.errors.email ? 'border-rose-500' : 'border-slate-200'
                }`}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                value={formik.values.email}
              />
              {formik.touched.email && formik.errors.email && (
                <p className="text-rose-500 text-xs mt-1 font-medium">{formik.errors.email}</p>
              )}
            </div>

            {/* Password Input */}
            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-200">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                placeholder="Enter password"
                className={`w-full rounded-xl border bg-slate-50/50 dark:bg-slate-900/80 py-3 px-4 text-xs text-slate-800 dark:text-slate-100 outline-none transition duration-150 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 ${
                  formik.touched.password && formik.errors.password ? 'border-rose-500' : 'border-slate-200'
                }`}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                value={formik.values.password}
              />
              {formik.touched.password && formik.errors.password && (
                <p className="text-rose-500 text-xs mt-1 font-medium">{formik.errors.password}</p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className={`w-full cursor-pointer rounded-xl p-3.5 text-xs font-extrabold text-white transition-all duration-200 shadow-md hover:shadow-lg mt-3 flex items-center justify-center ${
                loading ? 'bg-emerald-600/70 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
              }`}
              disabled={loading}
            >
              {loading ? <Spinner /> : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 text-center text-[11px] text-slate-400">
            Encrypted End-to-End Enterprise Session
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignIn;
