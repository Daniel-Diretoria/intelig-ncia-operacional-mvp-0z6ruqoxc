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
import { IndustryDetailPage } from '@/pages/IndustryDetailPage'
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
import { DevolucoesPage } from '@/pages/DevolucoesPage'
import { VisitasPage } from '@/pages/VisitasPage'
import { CadastrosPage } from '@/pages/CadastrosPage'
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
            <Route
              path="/visao-geral"
              element={
                <ProtectedRoute requiredPermission="inteligencia:visualizar">
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/cadastros"
              element={
                <ProtectedRoute requiredPermission="cadastros:visualizar">
                  <CadastrosPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/industrias"
              element={
                <ProtectedRoute requiredPermission="industrias:visualizar">
                  <IndustriasPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/industrias/:id"
              element={
                <ProtectedRoute requiredPermission="industrias:visualizar">
                  <IndustryDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/validades"
              element={
                <ProtectedRoute requiredPermission="validades:visualizar">
                  <ValidadesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/devolucoes"
              element={
                <ProtectedRoute requiredPermission="devolucoes:visualizar">
                  <DevolucoesPage />
                </ProtectedRoute>
              }
            />
            <Route path="/visitas" element={<VisitasPage />} />
            <Route
              path="/lojas"
              element={
                <ProtectedRoute requiredPermission="rede:visualizar">
                  <LojasPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/lojas/:storeId"
              element={
                <ProtectedRoute requiredPermission="rede:visualizar">
                  <StoreDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/rupturas"
              element={
                <ProtectedRoute requiredPermission="rupturas:visualizar">
                  <RupturasPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/alertas"
              element={
                <ProtectedRoute requiredPermission="inteligencia:visualizar">
                  <AlertasPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/auditoria"
              element={
                <ProtectedRoute requiredPermission="inteligencia:visualizar">
                  <AuditoriaPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/relatorios"
              element={
                <ProtectedRoute requiredPermission="inteligencia:visualizar">
                  <RelatoriosPage />
                </ProtectedRoute>
              }
            />
            <Route path="/configuracoes" element={<ConfiguracoesPage />} />
            <Route
              path="/assistente"
              element={
                <ProtectedRoute requiredPermission="inteligencia:visualizar">
                  <AssistantPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/importacao"
              element={
                <ProtectedRoute requiredPermission="integracoes:visualizar">
                  <ImportacaoPage />
                </ProtectedRoute>
              }
            />
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
