import React, { useState, useEffect } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import logoImg from '@/assets/image-9f672.png'
import {
  LayoutDashboard,
  CalendarCheck,
  PackageX,
  RotateCcw,
  Bell,
  ShieldAlert,
  FileBarChart,
  Settings,
  LogOut,
  Menu,
  X,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Upload,
  Store,
  Sparkles,
  Factory,
  Boxes,
  HelpCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/services/authContext'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface NavChildItem {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  badge?: string
  disabled?: boolean
}

interface NavSection {
  id: string
  label: string
  to?: string
  icon: React.ComponentType<{ className?: string }>
  children?: NavChildItem[]
  badge?: string
}

// 5 Grandes Áreas Principais + Área Secundária / Administrativa
const PRIMARY_AREAS: NavSection[] = [
  {
    id: 'inicio',
    label: 'Início',
    to: '/',
    icon: LayoutDashboard,
  },
  {
    id: 'operacao',
    label: 'Operação',
    icon: Boxes,
    children: [
      {
        to: '/validades',
        label: 'Validades',
        icon: CalendarCheck,
      },
      {
        to: '/rupturas',
        label: 'Rupturas',
        icon: PackageX,
      },
      {
        to: '/devolucoes',
        label: 'Devoluções / NF',
        icon: RotateCcw,
      },
    ],
  },
  {
    id: 'industrias',
    label: 'Indústrias',
    to: '/industrias',
    icon: Factory,
  },
  {
    id: 'rede',
    label: 'Rede',
    icon: Store,
    children: [
      {
        to: '/lojas',
        label: 'Lojas',
        icon: Store,
      },
    ],
  },
  {
    id: 'inteligencia',
    label: 'Inteligência',
    icon: FileBarChart,
    children: [
      {
        to: '/visao-geral',
        label: 'Visão Estratégica',
        icon: LayoutDashboard,
      },
      {
        to: '/relatorios',
        label: 'Relatórios',
        icon: FileBarChart,
      },
      {
        to: '/auditoria',
        label: 'Auditoria',
        icon: ShieldAlert,
      },
      {
        to: '/alertas',
        label: 'Alertas',
        icon: Bell,
      },
    ],
  },
]

// Área secundária / administrativa ao final (visualmente separada)
const SECONDARY_AREAS: NavChildItem[] = [
  {
    to: '/importacao',
    label: 'Importação',
    icon: Upload,
  },
  {
    to: '/configuracoes',
    label: 'Configurações',
    icon: Settings,
  },
  {
    to: '/assistente',
    label: 'Assistente',
    icon: Sparkles,
  },
]

export const AppLayout: React.FC = () => {
  const { user, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  // Sidebar collapse states
  const [isRailCollapsed, setIsRailCollapsed] = useState(false)
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Estado dos grupos expansíveis (por padrão todos abertos para rapidez operacional)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    operacao: true,
    rede: true,
    inteligencia: true,
  })

  const toggleGroup = (groupId: string) => {
    if (isRailCollapsed) {
      setIsRailCollapsed(false)
    }
    setExpandedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }))
  }

  // Auto detect tablet screen to collapse to rail
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth
      if (width >= 768 && width < 1024) {
        setIsRailCollapsed(true)
      }
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Header blur on scroll
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Close mobile drawer on route change
  useEffect(() => {
    setIsMobileDrawerOpen(false)
  }, [location.pathname])

  const handleSignOut = () => {
    signOut()
    navigate('/login')
  }

  const handleHeaderRefresh = () => {
    setIsRefreshing(true)
    window.dispatchEvent(new CustomEvent('diretoria:refresh'))
    setTimeout(() => {
      setIsRefreshing(false)
    }, 600)
  }

  // Obtém o título da página atual
  const getPageTitle = () => {
    if (location.pathname === '/') return 'Central de Trabalho'
    if (location.pathname === '/visao-geral') return 'Visão Estratégica'
    if (location.pathname.startsWith('/industrias')) return 'Indústrias & Fornecedores'
    if (location.pathname === '/validades') return 'Validades'
    if (location.pathname === '/rupturas') return 'Rupturas'
    if (location.pathname === '/devolucoes') return 'Devoluções / NF'
    if (location.pathname.startsWith('/lojas')) return 'Gestão de Lojas'
    if (location.pathname === '/relatorios') return 'Relatórios Operacionais'
    if (location.pathname === '/auditoria') return 'Auditoria & Governança'
    if (location.pathname === '/alertas') return 'Alertas'
    if (location.pathname === '/importacao') return 'Importação de Dados'
    if (location.pathname === '/configuracoes') return 'Configurações'
    if (location.pathname === '/assistente') return 'Assistente Operacional'
    return 'Inteligência Operacional'
  }

  const pageTitle = getPageTitle()
  const userName = user?.name || user?.email?.split('@')[0] || 'Usuário'

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col antialiased text-slate-900 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Mobile Drawer Backdrop */}
      {isMobileDrawerOpen && (
        <div
          onClick={() => setIsMobileDrawerOpen(false)}
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-250 ease-in-out"
        />
      )}

      {/* Mobile Slide-in Drawer */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 w-72 bg-slate-900 text-slate-100 border-r border-slate-800 z-50 flex flex-col transition-transform duration-200 ease-in-out lg:hidden shadow-2xl',
          isMobileDrawerOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Mobile Drawer Header */}
        <div className="h-20 px-5 border-b border-slate-800/90 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <img
              src={logoImg}
              alt="Diretoria Promoções Logo"
              className="h-10 w-auto object-contain drop-shadow-sm"
            />
            <div className="flex flex-col">
              <span className="font-bold text-sm tracking-tight text-white leading-tight">
                Diretoria Promoções
              </span>
              <span className="text-[10px] text-slate-400 font-medium">
                Inteligência Operacional
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsMobileDrawerOpen(false)}
            aria-label="Fechar menu"
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Mobile Navigation Links */}
        <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
          {/* 5 Grandes Áreas */}
          <div className="space-y-1.5">
            <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Navegação Principal
            </p>

            {PRIMARY_AREAS.map((section) => {
              const Icon = section.icon
              const hasChildren = section.children && section.children.length > 0

              if (!hasChildren && section.to) {
                const isActive =
                  section.to === '/'
                    ? location.pathname === '/'
                    : location.pathname.startsWith(section.to)

                return (
                  <NavLink
                    key={section.id}
                    to={section.to}
                    className={cn(
                      'flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                      isActive
                        ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                        : 'text-slate-300 hover:bg-slate-800/80 hover:text-white',
                    )}
                  >
                    <Icon
                      className={cn('w-5 h-5 shrink-0', isActive ? 'text-white' : 'text-slate-400')}
                    />
                    <span>{section.label}</span>
                  </NavLink>
                )
              }

              // Grupo expansível
              const isGroupActive = section.children?.some((child) =>
                location.pathname.startsWith(child.to),
              )
              const isExpanded = expandedGroups[section.id] !== false

              return (
                <div key={section.id} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => toggleGroup(section.id)}
                    className={cn(
                      'w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-sm font-medium text-slate-300 hover:bg-slate-800/80 hover:text-white transition-all',
                      isGroupActive && 'text-indigo-300 font-semibold',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Icon
                        className={cn(
                          'w-5 h-5 shrink-0',
                          isGroupActive ? 'text-indigo-400' : 'text-slate-400',
                        )}
                      />
                      <span>{section.label}</span>
                    </div>
                    <ChevronDown
                      className={cn(
                        'w-4 h-4 text-slate-400 transition-transform duration-200',
                        isExpanded ? 'rotate-180' : 'rotate-0',
                      )}
                    />
                  </button>

                  {isExpanded && (
                    <div className="pl-6 pr-1 space-y-1">
                      {section.children?.map((child) => {
                        const ChildIcon = child.icon
                        const isActive = location.pathname.startsWith(child.to)

                        return (
                          <NavLink
                            key={child.to}
                            to={child.to}
                            className={cn(
                              'flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all',
                              isActive
                                ? 'bg-indigo-600 text-white font-semibold'
                                : 'text-slate-400 hover:text-white hover:bg-slate-800/60',
                            )}
                          >
                            <ChildIcon className="w-4 h-4 shrink-0" />
                            <span>{child.label}</span>
                          </NavLink>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Área Secundária / Administrativa */}
          <div className="pt-3 border-t border-slate-800/80 space-y-1.5">
            <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Administração &amp; Suporte
            </p>
            {SECONDARY_AREAS.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname.startsWith(item.to)

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={cn(
                    'flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all',
                    isActive
                      ? 'bg-slate-800 text-white font-semibold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60',
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-4 h-4 shrink-0 text-slate-400" />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <Badge variant="outline" className="text-[9px] text-slate-400 border-slate-700">
                      {item.badge}
                    </Badge>
                  )}
                </NavLink>
              )
            })}
          </div>
        </nav>

        {/* Mobile User Profile & Logout */}
        <div className="p-4 border-t border-slate-800/90 bg-slate-950/50">
          <div className="flex items-center justify-between">
            <div className="truncate pr-2">
              <p className="text-xs font-semibold text-slate-200 truncate">{userName}</p>
              <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              aria-label="Sair da conta"
              className="text-slate-400 hover:text-red-400 hover:bg-red-950/40 h-8 px-2.5 gap-1.5 text-xs font-medium"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sair</span>
            </Button>
          </div>
        </div>
      </aside>

      {/* Desktop & Tablet Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 bg-slate-900 text-slate-100 border-r border-slate-800/90 z-30 hidden lg:flex flex-col transition-all duration-200 ease-in-out shadow-lg',
          isRailCollapsed ? 'w-[76px]' : 'w-[260px]',
        )}
      >
        {/* Sidebar Brand Header */}
        <div
          className={cn(
            'h-20 border-b border-slate-800/90 flex items-center px-4 transition-all bg-slate-950/50',
            isRailCollapsed ? 'justify-center' : 'justify-between',
          )}
        >
          <div className="flex items-center gap-3 overflow-hidden">
            <img
              src={logoImg}
              alt="Diretoria Promoções"
              className={cn(
                'object-contain drop-shadow-sm transition-all',
                isRailCollapsed ? 'h-9 w-auto max-w-[50px]' : 'h-11 w-auto max-w-[170px]',
              )}
            />
          </div>

          {!isRailCollapsed && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsRailCollapsed(true)}
              title="Recolher menu"
              aria-label="Recolher menu"
              className="w-7 h-7 text-slate-400 hover:text-indigo-400 hover:bg-slate-800/80 rounded-md"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Rail Expand Toggle Button when collapsed */}
        {isRailCollapsed && (
          <div className="pt-2 px-3 flex justify-center">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsRailCollapsed(false)}
              title="Expandir menu"
              aria-label="Expandir menu"
              className="w-8 h-8 text-slate-400 hover:text-indigo-400 hover:bg-slate-800/80 rounded-md"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* Navigation Sections */}
        <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
          {/* 5 Grandes Áreas */}
          <div className="space-y-1">
            {!isRailCollapsed && (
              <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Principal
              </p>
            )}

            {PRIMARY_AREAS.map((section) => {
              const Icon = section.icon
              const hasChildren = section.children && section.children.length > 0

              if (!hasChildren && section.to) {
                const isActive =
                  section.to === '/'
                    ? location.pathname === '/'
                    : location.pathname.startsWith(section.to)

                return (
                  <NavLink
                    key={section.id}
                    to={section.to}
                    title={isRailCollapsed ? section.label : undefined}
                    className={cn(
                      'flex items-center rounded-xl text-sm font-medium transition-all duration-150 group relative',
                      isRailCollapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2',
                      isActive
                        ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                        : 'text-slate-300 hover:bg-slate-800/80 hover:text-white',
                    )}
                  >
                    <Icon
                      className={cn(
                        'w-5 h-5 shrink-0 transition-colors',
                        isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200',
                      )}
                    />
                    {!isRailCollapsed && <span className="truncate">{section.label}</span>}
                  </NavLink>
                )
              }

              // Grupo expansível com filhos
              const isGroupActive = section.children?.some((child) =>
                location.pathname.startsWith(child.to),
              )
              const isExpanded = expandedGroups[section.id] !== false

              if (isRailCollapsed) {
                // Modo Rail: renderiza primeiro filho ou link principal
                const primaryChild = section.children?.[0]
                return (
                  <NavLink
                    key={section.id}
                    to={primaryChild?.to || '#'}
                    title={section.label}
                    className={cn(
                      'flex items-center justify-center p-2.5 rounded-xl text-sm font-medium transition-all duration-150 group',
                      isGroupActive
                        ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                        : 'text-slate-300 hover:bg-slate-800/80 hover:text-white',
                    )}
                  >
                    <Icon
                      className={cn(
                        'w-5 h-5 shrink-0 transition-colors',
                        isGroupActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200',
                      )}
                    />
                  </NavLink>
                )
              }

              return (
                <div key={section.id} className="space-y-0.5">
                  <button
                    type="button"
                    onClick={() => toggleGroup(section.id)}
                    className={cn(
                      'w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium text-slate-300 hover:bg-slate-800/80 hover:text-white transition-all',
                      isGroupActive && 'text-indigo-300 font-semibold',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Icon
                        className={cn(
                          'w-5 h-5 shrink-0',
                          isGroupActive ? 'text-indigo-400' : 'text-slate-400',
                        )}
                      />
                      <span className="truncate">{section.label}</span>
                    </div>
                    <ChevronDown
                      className={cn(
                        'w-4 h-4 text-slate-400 transition-transform duration-200',
                        isExpanded ? 'rotate-180' : 'rotate-0',
                      )}
                    />
                  </button>

                  {isExpanded && (
                    <div className="pl-7 pr-1 space-y-0.5 pt-0.5">
                      {section.children?.map((child) => {
                        const ChildIcon = child.icon
                        const isActive = location.pathname.startsWith(child.to)

                        return (
                          <NavLink
                            key={child.to}
                            to={child.to}
                            className={cn(
                              'flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all',
                              isActive
                                ? 'bg-indigo-600 text-white font-semibold'
                                : 'text-slate-400 hover:text-white hover:bg-slate-800/60',
                            )}
                          >
                            <ChildIcon className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{child.label}</span>
                          </NavLink>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Área Secundária / Administrativa */}
          <div className="pt-3 border-t border-slate-800/80 space-y-1">
            {!isRailCollapsed && (
              <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Área Administrativa
              </p>
            )}

            {SECONDARY_AREAS.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname.startsWith(item.to)

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  title={isRailCollapsed ? item.label : undefined}
                  className={cn(
                    'flex items-center rounded-xl text-xs font-medium transition-all duration-150 group',
                    isRailCollapsed ? 'justify-center p-2.5' : 'justify-between px-3 py-2',
                    isActive
                      ? 'bg-slate-800 text-white font-semibold'
                      : 'text-slate-400 hover:bg-slate-800/60 hover:text-white',
                  )}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Icon className="w-4 h-4 shrink-0 text-slate-400 group-hover:text-slate-200" />
                    {!isRailCollapsed && <span className="truncate">{item.label}</span>}
                  </div>
                  {!isRailCollapsed && item.badge && (
                    <Badge variant="outline" className="text-[9px] text-slate-400 border-slate-700">
                      {item.badge}
                    </Badge>
                  )}
                </NavLink>
              )
            })}
          </div>
        </nav>

        {/* Desktop User info & Logout */}
        <div className="p-3 border-t border-slate-800/90 bg-slate-950/50">
          {isRailCollapsed ? (
            <div className="flex flex-col items-center gap-2">
              <div
                title={`${userName} (${user?.email || ''})`}
                className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold text-xs flex items-center justify-center cursor-default"
              >
                {userName.slice(0, 2).toUpperCase()}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSignOut}
                title="Sair da conta"
                aria-label="Sair da conta"
                className="w-8 h-8 text-slate-400 hover:text-red-400 hover:bg-red-950/40 rounded-lg"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold text-xs flex items-center justify-center shrink-0">
                  {userName.slice(0, 2).toUpperCase()}
                </div>
                <div className="truncate">
                  <p className="text-xs font-semibold text-slate-200 truncate">{userName}</p>
                  <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSignOut}
                title="Sair"
                aria-label="Sair da conta"
                className="w-8 h-8 text-slate-400 hover:text-red-400 hover:bg-red-950/40 rounded-lg shrink-0"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </aside>

      {/* Main App Container */}
      <div
        className={cn(
          'flex-1 flex flex-col min-h-screen transition-all duration-250 ease-in-out',
          'lg:pl-[260px]',
          isRailCollapsed && 'lg:pl-[76px]',
        )}
      >
        {/* Sticky Header */}
        <header
          className={cn(
            'sticky top-0 z-20 h-16 px-4 sm:px-6 lg:px-8 flex items-center justify-between transition-all duration-200 border-b border-slate-200/80',
            isScrolled ? 'bg-white/90 backdrop-blur-md shadow-xs' : 'bg-white/80 backdrop-blur-sm',
          )}
        >
          <div className="flex items-center gap-3">
            {/* Hamburger for Mobile & Tablet */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMobileDrawerOpen(true)}
              className="lg:hidden text-slate-600 hover:text-slate-900 w-9 h-9"
            >
              <Menu className="w-5 h-5" />
            </Button>

            <div className="flex items-center gap-2.5">
              <h2 className="text-lg lg:text-xl font-bold text-slate-900 tracking-tight">
                {pageTitle}
              </h2>
            </div>
          </div>

          {/* Contextual Action Area */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleHeaderRefresh}
              disabled={isRefreshing}
              className="h-9 px-3 gap-1.5 border-slate-200 text-slate-700 hover:bg-slate-50 shadow-2xs font-medium text-xs"
            >
              <RefreshCw
                className={cn(
                  'w-3.5 h-3.5 text-slate-500',
                  isRefreshing && 'animate-spin text-indigo-600',
                )}
              />
              <span className="hidden sm:inline">
                {isRefreshing ? 'Atualizando...' : 'Atualizar'}
              </span>
            </Button>
          </div>
        </header>

        {/* Main Content View */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto animate-fade-in">
          <Outlet />
        </main>

        {/* Footer */}
        <footer className="py-4 px-6 border-t border-slate-200/60 text-center bg-white/40">
          <p className="text-xs text-slate-400 font-medium tracking-tight">
            Diretoria Promoções — Inteligência Operacional
          </p>
        </footer>
      </div>
    </div>
  )
}

export default AppLayout
