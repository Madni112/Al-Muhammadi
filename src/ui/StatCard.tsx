import React from 'react';
import { IconType } from 'react-icons';
import GlassCard from './GlassCard';

interface StatCardProps {
  title: string;
  value: number | string;
  Icon: IconType;
  /** Tailwind gradient class for the icon background */
  bgColor?: string;
  decimals?: number;
  thisMonthValue?: number | string;
  thisMonthLabel?: string;
  onClick?: () => void;
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  Icon,
  bgColor = 'bg-gradient-to-br from-emerald-500 to-teal-700',
  decimals,
  thisMonthValue,
  thisMonthLabel = 'This Month',
  onClick,
}) => {
  const formattedValue =
    typeof value === 'number'
      ? value.toLocaleString(undefined, {
          minimumFractionDigits: decimals !== undefined ? decimals : Number.isInteger(value) ? 0 : 2,
          maximumFractionDigits: decimals !== undefined ? decimals : Number.isInteger(value) ? 0 : 2,
        })
      : value;

  const isNegative = typeof thisMonthValue === 'number' && thisMonthValue < 0;
  const absThisMonth = typeof thisMonthValue === 'number' ? Math.abs(thisMonthValue) : thisMonthValue;
  const formattedThisMonth =
    typeof absThisMonth === 'number'
      ? absThisMonth.toLocaleString(undefined, {
          minimumFractionDigits: decimals !== undefined ? decimals : Number.isInteger(absThisMonth) ? 0 : 2,
          maximumFractionDigits: decimals !== undefined ? decimals : Number.isInteger(absThisMonth) ? 0 : 2,
        })
      : absThisMonth;

  return (
    <GlassCard
      onClick={onClick}
      className={`flex flex-col justify-between p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group ${
        onClick ? 'cursor-pointer hover:border-emerald-500/40' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 tracking-wide uppercase">{title}</span>
          <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-1 tracking-tight truncate">
            {formattedValue}
          </span>
        </div>
        <div
          className={`flex items-center justify-center w-11 h-11 rounded-2xl text-white shadow-md ${bgColor} group-hover:scale-110 transition-transform duration-200 shrink-0 ${
            onClick ? 'ring-2 ring-white/20' : ''
          }`}
          title={onClick ? "Click to view full mathematical breakdown" : undefined}
        >
          <Icon size={22} />
        </div>
      </div>

      {thisMonthValue !== undefined && (
        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px]">
          <span className="text-slate-400 dark:text-slate-500 font-medium">{thisMonthLabel}:</span>
          <span className={`font-bold font-mono ${isNegative ? 'text-rose-500 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
            {isNegative ? '-' : ''}Rs. {formattedThisMonth}
          </span>
        </div>
      )}
    </GlassCard>
  );
};

export default StatCard;
