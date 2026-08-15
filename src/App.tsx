import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/services/authContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AppLayout } from '@/layouts/AppLayout'

// Pages
import { LoginPage } from '@/pages/Login'
import { DashboardPage } from '@/pages/Dashboard'
import { ValidadesPage } from '@/pages/Validades'
import { RupturasPage } from '@/pages/Rupturas'
import { AlertasPage } from '@/pages/Alertas'
import { RelatoriosPage } from '@/pages/Relatorios'
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
            <Route path="/" element={<DashboardPage />} />
            <Route path="/validades" element={<ValidadesPage />} />
            <Route path="/rupturas" element={<RupturasPage />} />
            <Route path="/alertas" element={<AlertasPage />} />
            <Route path="/relatorios" element={<RelatoriosPage />} />
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
