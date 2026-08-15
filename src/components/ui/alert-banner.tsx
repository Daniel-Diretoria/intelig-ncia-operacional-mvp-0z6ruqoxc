import React from 'react'
import { cn } from '@/lib/utils'
import { AlertTriangle, AlertCircle, Info, CheckCircle2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface AlertBannerProps {
  type?: 'error' | 'warning' | 'info' | 'success'
  title?: string
  message: string
  onRetry?: () => void
  retryLabel?: string
  className?: string
}

const typeConfigs = {
  error: {
    icon: AlertCircle,
    container: 'bg-red-50/80 border-red-200 text-red-900',
    iconColor: 'text-red-600',
    btnVariant: 'destructive' as const,
  },
  warning: {
    icon: AlertTriangle,
    container: 'bg-amber-50/80 border-amber-200 text-amber-900',
    iconColor: 'text-amber-600',
    btnVariant: 'outline' as const,
  },
  info: {
    icon: Info,
    container: 'bg-blue-50/80 border-blue-200 text-blue-900',
    iconColor: 'text-blue-600',
    btnVariant: 'outline' as const,
  },
  success: {
    icon: CheckCircle2,
    container: 'bg-emerald-50/80 border-emerald-200 text-emerald-900',
    iconColor: 'text-emerald-600',
    btnVariant: 'outline' as const,
  },
}

export const AlertBanner: React.FC<AlertBannerProps> = ({
  type = 'error',
  title,
  message,
  onRetry,
  retryLabel = 'Tentar novamente',
  className,
}) => {
  const cfg = typeConfigs[type]
  const Icon = cfg.icon

  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-3 p-4 rounded-xl border text-sm animate-fade-in',
        cfg.container,
        className,
      )}
    >
      <Icon className={cn('w-5 h-5 shrink-0 mt-0.5', cfg.iconColor)} />
      <div className="flex-1">
        {title && <h4 className="font-semibold mb-0.5">{title}</h4>}
        <p className="text-slate-700 leading-relaxed">{message}</p>
      </div>
      {onRetry && (
        <Button
          size="sm"
          variant="outline"
          onClick={onRetry}
          className="shrink-0 h-8 gap-1.5 border-red-300 text-red-700 hover:bg-red-100/60"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          {retryLabel}
        </Button>
      )}
    </div>
  )
}
