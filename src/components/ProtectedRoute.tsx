import React from 'react'
import { Navigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '@/services/authContext'
import { Loader2, ShieldX, ArrowLeft } from 'lucide-react'
import { PermissionKey } from '@/types/permissions'
import { Button } from '@/components/ui/button'

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredPermission?: PermissionKey
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requiredPermission }) => {
  const { isAuthenticated, isLoading, can, status } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-50 text-slate-500 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        <p className="text-sm font-medium">Carregando Diretoria Promoções...</p>
      </div>
    )
  }

  if (!isAuthenticated || status === 'inativo') {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Verificação de permissão específica de rota
  if (requiredPermission && !can(requiredPermission)) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6 max-w-md mx-auto animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mb-4">
          <ShieldX className="w-8 h-8" />
        </div>
        <h2 className="text-lg font-bold text-slate-900 tracking-tight">
          Você não possui acesso a esta área
        </h2>
        <p className="text-xs text-slate-500 mt-2 leading-relaxed">
          Seu perfil de acesso atual não possui permissão para visualizar ou gerenciar esta seção.
          Solicite acesso ao administrador caso necessário.
        </p>
        <div className="mt-6 flex items-center gap-3">
          <Button asChild variant="outline" size="sm" className="gap-2 text-xs">
            <Link to="/">
              <ArrowLeft className="w-3.5 h-3.5" />
              Voltar ao Início
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
