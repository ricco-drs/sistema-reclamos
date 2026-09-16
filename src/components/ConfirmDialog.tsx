import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm bg-claude-panel border border-claude-border rounded-2xl shadow-2xl p-6 animate-modal-in"
      >
        <div className={`w-11 h-11 rounded-full flex items-center justify-center mb-4 ${
          danger ? 'bg-red-500/15' : 'bg-claude-accent/15'
        }`}>
          <AlertTriangle className={`w-5 h-5 ${danger ? 'text-red-400' : 'text-claude-accent'}`} />
        </div>

        <h3 className="text-base font-semibold text-claude-text mb-1.5">{title}</h3>
        <p className="text-sm text-claude-muted leading-relaxed mb-6">{message}</p>

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-sm font-medium text-claude-text bg-claude-border/50 hover:bg-claude-border transition-colors cursor-pointer disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 ${
              danger
                ? 'bg-red-500/90 text-white hover:bg-red-500'
                : 'bg-claude-text text-claude-bg hover:opacity-90'
            }`}
          >
            {loading ? 'Eliminando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
