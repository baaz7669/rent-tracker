import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { RotateCcw, X } from 'lucide-react';
import { formatMoney } from '../logic/format';

export const ToastUndo: React.FC = () => {
  const { undoAction, undoLastPayment, dismissUndo, currency } = useApp();
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (!undoAction) {
      setProgress(100);
      return;
    }

    const interval = setInterval(() => {
      const remainingMs = undoAction.expiresAt - Date.now();
      const pct = Math.max(0, (remainingMs / 6000) * 100);
      setProgress(pct);
      if (pct <= 0) {
        clearInterval(interval);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [undoAction]);

  if (!undoAction) return null;

  return (
    <div className="fixed bottom-20 md:bottom-6 left-4 right-4 md:left-auto md:right-8 md:w-96 z-50 animate-slide-up">
      <div className="bg-[#18232A] text-white rounded-xl shadow-2xl border border-[#2B3A44] overflow-hidden p-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-400 font-medium">Payment recorded</p>
            <p className="text-sm font-semibold truncate text-[#6CD39B]">
              {formatMoney(undoAction.amount, currency)} · {undoAction.building} {undoAction.unitName}
            </p>
          </div>
          <button
            onClick={undoLastPayment}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#B4341F] hover:bg-[#c93c24] text-white font-semibold text-xs rounded-lg shadow-sm transition active:scale-95 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Undo
          </button>
          <button
            onClick={dismissUndo}
            className="p-1 text-gray-400 hover:text-white rounded-md cursor-pointer"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* Animated Progress Bar */}
        <div className="w-full bg-[#2B3A44] h-1 rounded-full mt-2.5 overflow-hidden">
          <div
            className="bg-[#7D8CE8] h-full transition-all duration-75 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
};
