import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/services/authContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AppLayout } from '@/layouts/AppLayout'

// Pages
import { LoginPage } from '@/pages/Login'
import { CentralDeTrabalhoPage } from '@/pages/CentralDeTrabalho'
import { DashboardPage } from '@/pages/Dashboard'
import { IndustriasPage } from '@/pages/Industrias'
import { ValidadesPage } from '@/pages/Validades'
import { LojasPage } from '@/pages/Lojas'
import { StoreDetailPage } from '@/pages/StoreDetailPage'
import { RupturasPage } from '@/pages/Rupturas'
import { AlertasPage } from '@/pages/Alertas'
import { AuditoriaPage } from '@/pages/Auditoria'
import { RelatoriosPage } from '@/pages/Relatorios'
import { ConfiguracoesPage } from '@/pages/Configuracoes'
import { AssistantPage } from '@/pages/AssistantPage'
import { ImportacaoPage } from '@/pages/Importacao'
import NotFound from '@/pages/NotFound'

const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Routes>
          {/* Public Auth Route */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected Application Routes */}
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<CentralDeTrabalhoPage />} />
            <Route path="/visao-geral" element={<DashboardPage />} />
            <Route path="/industrias" element={<IndustriasPage />} />
            <Route path="/validades" element={<ValidadesPage />} />
            <Route path="/lojas" element={<LojasPage />} />
            <Route path="/lojas/:storeId" element={<StoreDetailPage />} />
            <Route path="/rupturas" element={<RupturasPage />} />
            <Route path="/alertas" element={<AlertasPage />} />
            <Route path="/auditoria" element={<AuditoriaPage />} />
            <Route path="/relatorios" element={<RelatoriosPage />} />
            <Route path="/configuracoes" element={<ConfiguracoesPage />} />
            <Route path="/assistente" element={<AssistantPage />} />
            <Route path="/importacao" element={<ImportacaoPage />} />
          </Route>

          {/* Fallback */}
          <Route path="/404" element={<NotFound />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </TooltipProvider>
    </AuthProvider>
  </BrowserRouter>
)

export default App
