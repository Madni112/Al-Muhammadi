import React from 'react';
import { IconType } from 'react-icons';

export type ActionCardVariant = 'blackToWhite' | 'whiteToBlack' | 'black' | 'red' | 'custom';

interface ActionCardProps {
  title: string;
  subtitle: string;
  Icon: IconType;
  variant?: ActionCardVariant;
  bgGradient?: string;
  isLight?: boolean;
  onClick: () => void;
}

const ActionCard: React.FC<ActionCardProps> = ({
  title,
  subtitle,
  Icon,
  variant,
  bgGradient = 'bg-gradient-to-br from-red-600 to-rose-700',
  isLight = false,
  onClick,
}) => {
  let resolvedBg = bgGradient;
  let textColor = 'text-white';
  let subtitleColor = 'text-white/85';
  let iconContainerClass = 'bg-white/15 text-white';
  let orbColor = 'bg-white/10';

  if (variant === 'blackToWhite') {
    resolvedBg =
      'bg-gradient-to-br from-[#181D27] to-[#181D27] dark:from-slate-100 dark:to-slate-200 border border-slate-800 dark:border-slate-200/90';
    textColor = 'text-white dark:text-slate-900';
    subtitleColor = 'text-slate-300 dark:text-slate-600';
    iconContainerClass = 'bg-white/15 text-white dark:bg-slate-900/10 dark:text-slate-800';
    orbColor = 'bg-white/10 dark:bg-slate-500/10';
  } else if (variant === 'whiteToBlack') {
    resolvedBg =
      'bg-gradient-to-br from-slate-100 to-slate-200 dark:from-[#181D27] dark:to-[#181D27] border border-slate-200/90 dark:border-slate-800';
    textColor = 'text-slate-900 dark:text-white';
    subtitleColor = 'text-slate-600 dark:text-slate-300';
    iconContainerClass = 'bg-slate-900/10 text-slate-800 dark:bg-white/15 dark:text-white';
    orbColor = 'bg-slate-500/10 dark:bg-white/10';
  } else if (variant === 'black') {
    resolvedBg = 'bg-[#181D27] dark:bg-[#181D27] border border-slate-800 dark:border-slate-800';
    textColor = 'text-white';
    subtitleColor = 'text-slate-300 dark:text-slate-300';
    iconContainerClass = 'bg-white/15 text-white';
    orbColor = 'bg-white/10';
  } else if (variant === 'red') {
    resolvedBg = 'bg-gradient-to-br from-red-600 via-red-600 to-rose-700 shadow-lg shadow-red-600/20';
    textColor = 'text-white';
    subtitleColor = 'text-white/85';
    iconContainerClass = 'bg-white/20 text-white';
    orbColor = 'bg-white/10';
  } else if (isLight) {
    resolvedBg = `${bgGradient} dark:bg-none dark:from-[#181D27] dark:to-[#181D27] dark:bg-[#181D27] dark:border-slate-800`;
    textColor = 'text-slate-900 dark:text-white';
    subtitleColor = 'text-slate-600 dark:text-slate-300';
    iconContainerClass = 'bg-slate-900/10 text-slate-800 dark:bg-white/15 dark:text-white';
    orbColor = 'bg-slate-500/10 dark:bg-white/10';
  }

  return (
    <div
      className={`p-5 rounded-2xl cursor-pointer transform transition-all duration-200 hover:-translate-y-1 hover:shadow-xl ${resolvedBg} ${textColor} flex items-center justify-between shadow-md relative overflow-hidden group`}
      onClick={onClick}
    >
      {/* Decorative background light orb */}
      <div
        className={`absolute -right-6 -bottom-6 w-24 h-24 rounded-full ${orbColor} blur-xl group-hover:scale-125 transition-transform duration-300 pointer-events-none`}
      />

      <div className="flex flex-col z-10">
        <span className="text-sm font-extrabold uppercase tracking-wider">{title}</span>
        <span className={`text-xs font-medium mt-0.5 ${subtitleColor}`}>
          {subtitle}
        </span>
      </div>
      <div
        className={`p-2.5 rounded-xl ${iconContainerClass} backdrop-blur-xs group-hover:scale-110 transition-transform duration-200 z-10`}
      >
        <Icon size={24} />
      </div>
    </div>
  );
};

export default ActionCard;

