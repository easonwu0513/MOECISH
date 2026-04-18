'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from '../icons';

type ToastType = 'success' | 'error' | 'warning' | 'info';
type Toast = {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
};

type ToastContextValue = {
  show: (t: Omit<Toast, 'id'>) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const v = useContext(ToastContext);
  if (!v) throw new Error('useToast must be inside <ToastProvider>');
  return v;
}

const toneMap: Record<ToastType, { icon: React.ReactNode; bar: string; text: string; bg: string }> = {
  success: { icon: <CheckCircle size={20} />, bar: 'bg-success-500', text: 'text-success-700', bg: 'bg-success-50' },
  error:   { icon: <AlertCircle size={20} />, bar: 'bg-danger-500',  text: 'text-danger-700',  bg: 'bg-danger-50' },
  warning: { icon: <AlertTriangle size={20} />, bar: 'bg-warning-500', text: 'text-warning-700', bg: 'bg-warning-50' },
  info:    { icon: <Info size={20} />, bar: 'bg-primary-500', text: 'text-primary-700', bg: 'bg-primary-50' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback<ToastContextValue['show']>(
    (t) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const toast: Toast = { id, duration: 4500, ...t };
      setToasts((prev) => [...prev, toast]);
      if (toast.duration && toast.duration > 0) {
        const timer = setTimeout(() => remove(id), toast.duration);
        timers.current.set(id, timer);
      }
    },
    [remove],
  );

  const value: ToastContextValue = {
    show,
    success: (title, description) => show({ type: 'success', title, description }),
    error: (title, description) => show({ type: 'error', title, description, duration: 6000 }),
    warning: (title, description) => show({ type: 'warning', title, description }),
    info: (title, description) => show({ type: 'info', title, description }),
  };

  useEffect(() => {
    return () => {
      timers.current.forEach((t) => clearTimeout(t));
      timers.current.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="region"
        aria-label="通知"
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-full max-w-sm"
      >
        {toasts.map((t) => {
          const tone = toneMap[t.type];
          return (
            <div
              key={t.id}
              role="status"
              className={cn(
                'pointer-events-auto relative flex gap-3 rounded-xl bg-white border border-neutral-200 shadow-lg overflow-hidden pl-4 pr-3 py-3 animate-slide-up',
              )}
            >
              <div className={cn('absolute left-0 top-0 bottom-0 w-1', tone.bar)} />
              <div className={cn(tone.text, 'shrink-0')}>{tone.icon}</div>
              <div className="flex-1 min-w-0">
                <p className="text-body-sm font-medium text-neutral-900">{t.title}</p>
                {t.description && (
                  <p className="text-caption text-neutral-600 mt-0.5 break-words">{t.description}</p>
                )}
              </div>
              <button
                onClick={() => remove(t.id)}
                aria-label="關閉通知"
                className="shrink-0 text-neutral-400 hover:text-neutral-700 focus-ring rounded"
              >
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
