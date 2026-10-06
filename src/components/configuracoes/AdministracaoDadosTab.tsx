import { useState, useEffect } from 'react'
import {
  Trash2,
  AlertTriangle,
  ShieldCheck,
  RefreshCw,
  Database,
  History,
  CheckCircle2,
  Lock,
  Layers,
  ArrowRight,
  Info,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/services/authContext'
import {
  getOperationalCleanupStats,
  executeOperationalCleanup,
  listOperationalBackups,
  restoreOperationalBackup,
  type OperationalCleanupStats,
  type BackupRecord,
  type CleanupResult,
} from '@/services/operationalCleanupService'

export function AdministracaoDadosTab() {
  const { toast } = useToast()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [loadingStats, setLoadingStats] = useState(false)
  const [stats, setStats] = useState<OperationalCleanupStats | null>(null)
  const [backups, setBackups] = useState<BackupRecord[]>([])
  const [loadingBackups, setLoadingBackups] = useState(false)

  // Modal de Limpeza
  const [modalOpen, setModalOpen] = useState(false)
  const [targetType, setTargetType] = useState<'all' | 'validades' | 'rupturas'>('all')
  const [confirmInput, setConfirmInput] = useState('')
  const [executing, setExecuting] = useState(false)
  const [lastResult, setLastResult] = useState<CleanupResult | null>(null)

  // Restauração
  const [restoringCode, setRestoringCode] = useState<string | null>(null)

  const loadData = async () => {
    setLoadingStats(true)
    setLoadingBackups(true)
    try {
      const s = await getOperationalCleanupStats()
      setStats(s)
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar estatísticas operacionais',
        description: err?.message || 'Falha ao consultar contagens',
        variant: 'destructive',
      })
    } finally {
      setLoadingStats(false)
    }

    try {
      const bList = await listOperationalBackups()
      setBackups(bList)
    } catch (_) {
      // Ignora erro se usuário não tiver permissão
    } finally {
      setLoadingBackups(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleOpenModal = (target: 'all' | 'validades' | 'rupturas') => {
    setTargetType(target)
    setConfirmInput('')
    setModalOpen(true)
  }

  const handleExecuteCleanup = async () => {
    if (confirmInput.trim().toUpperCase() !== 'LIMPAR') {
      toast({
        title: 'Confirmação obrigatória',
        description: 'Digite exatamente LIMPAR para confirmar a exclusão.',
        variant: 'destructive',
      })
      return
    }

    setExecuting(true)
    try {
      const result = await executeOperationalCleanup({
        target: targetType,
        confirmText: 'LIMPAR',
        motivo: 'Preparação do piloto histórico',
      })

      setLastResult(result)
      setModalOpen(false)
      toast({
        title: 'Limpeza operacional concluída!',
        description: `Removidos: ${result.removed.validades} validades e ${result.removed.rupturas} rupturas. Backup gerado: ${result.backupCode}`,
      })
      await loadData()
    } catch (err: any) {
      toast({
        title: 'Falha na limpeza operacional',
        description: err?.message || 'Erro durante a exclusão dos registros.',
        variant: 'destructive',
      })
    } finally {
      setExecuting(false)
    }
  }

  const handleRestore = async (backupCode: string) => {
    if (
      !confirm(
        `Deseja restaurar o backup ${backupCode}? Isso reporá os registros operacionais arquivados.`,
      )
    ) {
      return
    }

    setRestoringCode(backupCode)
    try {
      const res = await restoreOperationalBackup(backupCode)
      toast({
        title: 'Backup restaurado com sucesso',
        description: res.message || `O backup ${backupCode} foi reintegrado à base.`,
      })
      await loadData()
    } catch (err: any) {
      toast({
        title: 'Erro na restauração',
        description: err?.message || 'Não foi possível restaurar os dados.',
        variant: 'destructive',
      })
    } finally {
      setRestoringCode(null)
    }
  }

  if (!isAdmin) {
    return (
      <Card className="border-amber-200 bg-amber-50/50">
        <CardHeader>
          <div className="flex items-center gap-2 text-amber-800">
            <Lock className="w-5 h-5 text-amber-600" />
            <CardTitle>Área Restrita a Administradores</CardTitle>
          </div>
          <CardDescription className="text-amber-700">
            A Administração de Dados e a limpeza operacional de Validades e Rupturas são restritas a
            usuários com perfil de Administrador.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-amber-900">
            Seu perfil atual (<strong>{user?.role || 'operador'}</strong>) não possui permissão para
            acessar esta área destrutiva. Contate um administrador para solicitar a preparação da
            base operacional.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Top Banner de Contexto */}
      <Alert className="border-blue-200 bg-blue-50/40">
        <Info className="h-4 w-4 text-blue-600" />
        <AlertTitle className="text-blue-900 font-semibold">
          Preparação do Piloto Histórico — Limpeza Controlada de Validades e Rupturas
        </AlertTitle>
        <AlertDescription className="text-blue-800 text-xs mt-1 leading-relaxed">
          Esta rotina permite limpar <strong>somente a massa operacional</strong> de Validades e
          Rupturas para reescrever 2 a 3 semanas de histórico real. Cadastros fundamentais
          (Indústrias, Lojas, Produtos, Mix Oficial/Definido, Usuários, Permissões, Devoluções/NF,
          WhatsApp, Credenciais e Arquivo Documental) são <strong>100% preservados</strong>.
        </AlertDescription>
      </Alert>

      {/* Estatísticas Operacionais Atuais */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Database className="w-4 h-4 text-primary" />
                Massa Operacional Atual
              </CardTitle>
              <CardDescription className="text-xs">
                Contagem em tempo real de registros que serão afetados pela limpeza
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              disabled={loadingStats}
              className="h-8 gap-1 text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingStats ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 border rounded-lg bg-card shadow-sm">
              <span className="text-xs text-muted-foreground block mb-1">
                Registros de Validades
              </span>
              <span className="text-2xl font-bold tracking-tight text-foreground">
                {loadingStats ? '...' : (stats?.validades ?? 0).toLocaleString('pt-BR')}
              </span>
              <span className="text-[11px] text-muted-foreground block mt-1">
                Base operacional ({stats?.validadesBase ?? 0})
              </span>
            </div>

            <div className="p-3 border rounded-lg bg-card shadow-sm">
              <span className="text-xs text-muted-foreground block mb-1">
                Registros de Rupturas
              </span>
              <span className="text-2xl font-bold tracking-tight text-foreground">
                {loadingStats ? '...' : (stats?.rupturas ?? 0).toLocaleString('pt-BR')}
              </span>
              <span className="text-[11px] text-muted-foreground block mt-1">
                Base operacional ({stats?.rupturas ?? 0})
              </span>
            </div>

            <div className="p-3 border rounded-lg bg-card shadow-sm">
              <span className="text-xs text-muted-foreground block mb-1">
                Cruzamentos (Derivados)
              </span>
              <span className="text-2xl font-bold tracking-tight text-foreground">
                {loadingStats
                  ? '...'
                  : (stats?.operationalCrossEvidence ?? 0).toLocaleString('pt-BR')}
              </span>
              <span className="text-[11px] text-muted-foreground block mt-1">
                Confronto Validades x Rupturas
              </span>
            </div>

            <div className="p-3 border rounded-lg bg-card shadow-sm">
              <span className="text-xs text-muted-foreground block mb-1">
                Pendências de Auditoria
              </span>
              <span className="text-2xl font-bold tracking-tight text-foreground">
                {loadingStats ? '...' : (stats?.auditoriaPendencias ?? 0).toLocaleString('pt-BR')}
              </span>
              <span className="text-[11px] text-muted-foreground block mt-1">
                Derivadas da massa atual
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cartão de Ação Destrutiva com Garantias */}
      <Card className="border-red-200">
        <CardHeader className="bg-red-50/40 border-b border-red-100">
          <div className="flex items-center gap-2 text-red-800">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <CardTitle className="text-base">Limpar Dados de Validades e Rupturas</CardTitle>
          </div>
          <CardDescription className="text-xs text-red-700">
            Ação administrativa restrita com criação automática de snapshot de segurança antes da
            exclusão.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* O que é removido */}
            <div className="p-3 bg-red-50/50 rounded-lg border border-red-200 space-y-2">
              <div className="font-semibold text-red-900 flex items-center gap-1.5">
                <Trash2 className="w-4 h-4 text-red-600" />
                O que será removido:
              </div>
              <ul className="list-disc list-inside space-y-1 text-red-800">
                <li>
                  Registros operacionais de Validades (<code>validades_base</code>,{' '}
                  <code>validades_imported</code>, <code>validades_raw</code>)
                </li>
                <li>
                  Registros operacionais de Rupturas (<code>rupturas_base</code>,{' '}
                  <code>rupturas_historico</code>)
                </li>
                <li>
                  Confrontos e cruzamentos derivados (<code>operational_cross_evidence</code>)
                </li>
                <li>Pendências derivadas de auditoria operacional</li>
                <li>
                  Resultados calculados obsoletos do Motor de Acompanhamento (reconstruídos após
                  importação)
                </li>
              </ul>
            </div>

            {/* O que é preservado */}
            <div className="p-3 bg-emerald-50/50 rounded-lg border border-emerald-200 space-y-2">
              <div className="font-semibold text-emerald-900 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                O que fica 100% preservado e intacto:
              </div>
              <ul className="list-disc list-inside space-y-1 text-emerald-800">
                <li>Usuários, perfis e permissões de acesso</li>
                <li>Indústrias, vínculo TradePro Cliente→Indústria e lojas</li>
                <li>
                  Cadastro Operacional (<code>industry_*</code>: mix, pesquisas obrigatórias,
                  políticas)
                </li>
                <li>Mix Oficial, Definido e Observado</li>
                <li>Dicionário de Produtos, Aliases de Loja e Rede</li>
                <li>Módulo Devoluções/NF, WhatsApp, Caixa de Importação e Arquivo Documental</li>
                <li>Credenciais e regras de integração TradePro</li>
                <li>
                  Log histórico de auditoria (<code>user_audit_log</code>)
                </li>
              </ul>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <Button variant="destructive" className="gap-2" onClick={() => handleOpenModal('all')}>
              <Trash2 className="w-4 h-4" />
              Limpar Validades e Rupturas (Recomendado para Piloto)
            </Button>

            <Button
              variant="outline"
              className="border-red-300 text-red-700 hover:bg-red-50"
              onClick={() => handleOpenModal('validades')}
            >
              Limpar apenas Validades
            </Button>

            <Button
              variant="outline"
              className="border-red-300 text-red-700 hover:bg-red-50"
              onClick={() => handleOpenModal('rupturas')}
            >
              Limpar apenas Rupturas
            </Button>
          </div>
        </CardContent>
        {lastResult && (
          <CardFooter className="bg-muted/40 border-t py-2 px-4 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
              Última limpeza em {new Date(lastResult.dataExecucao).toLocaleString('pt-BR')} (Backup:{' '}
              {lastResult.backupCode})
            </div>
            <span className="text-muted-foreground">
              Removidos: {lastResult.removed.validades} validades / {lastResult.removed.rupturas}{' '}
              rupturas
            </span>
          </CardFooter>
        )}
      </Card>

      {/* Histórico de Backups e Recuperação */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <History className="w-4 h-4 text-primary" />
                Backups de Segurança Operacional
              </CardTitle>
              <CardDescription className="text-xs">
                Snapshots criados antes de cada limpeza para permitir recuperação rápida em caso de
                engano
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingBackups ? (
            <div className="text-center py-6 text-sm text-muted-foreground">
              Carregando backups...
            </div>
          ) : backups.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground border rounded-lg border-dashed">
              Nenhum snapshot de backup gerado até o momento.
            </div>
          ) : (
            <div className="divide-y border rounded-lg">
              {backups.map((b) => (
                <div
                  key={b.id}
                  className="p-3 flex items-center justify-between text-xs hover:bg-muted/30"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-foreground">
                        {b.backup_code}
                      </span>
                      <Badge
                        variant={
                          b.status === 'ativo'
                            ? 'outline'
                            : b.status === 'restaurado'
                              ? 'secondary'
                              : 'default'
                        }
                        className="text-[10px]"
                      >
                        {b.status === 'ativo'
                          ? 'Disponível'
                          : b.status === 'restaurado'
                            ? 'Restaurado'
                            : b.status}
                      </Badge>
                    </div>
                    <div className="text-muted-foreground">
                      Por: <strong>{b.executado_por_nome}</strong> em{' '}
                      {new Date(b.data_criacao).toLocaleString('pt-BR')}
                    </div>
                    <div className="text-muted-foreground">
                      Itens salvos: {b.validades_count} validades, {b.rupturas_count} rupturas,{' '}
                      {b.derived_cross_count} cruzamentos
                    </div>
                  </div>

                  <div>
                    {b.status === 'ativo' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs gap-1 border-blue-300 text-blue-700 hover:bg-blue-50"
                        onClick={() => handleRestore(b.backup_code)}
                        disabled={restoringCode === b.backup_code}
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${restoringCode === b.backup_code ? 'animate-spin' : ''}`}
                        />
                        Restaurar Backup
                      </Button>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">
                        Restaurado em{' '}
                        {b.restaurado_em
                          ? new Date(b.restaurado_em).toLocaleDateString('pt-BR')
                          : '-'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de Confirmação Destrutiva Explícita */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-destructive mb-1">
              <AlertTriangle className="w-5 h-5" />
              <DialogTitle>Confirmar Limpeza Operacional</DialogTitle>
            </div>
            <DialogDescription className="text-xs leading-relaxed text-muted-foreground">
              Esta ação removerá os registros operacionais atuais de Validades e Rupturas.
              Cadastros, configurações, usuários, Devoluções/NF e documentos serão preservados.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            {/* Resumo de impacto */}
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-900 space-y-1.5">
              <div className="font-semibold">Registros que serão removidos agora:</div>
              <div className="flex justify-between">
                <span>Validades que serão removidas:</span>
                <span className="font-bold">
                  {targetType === 'rupturas' ? 0 : (stats?.validades ?? 0).toLocaleString('pt-BR')}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Rupturas que serão removidas:</span>
                <span className="font-bold">
                  {targetType === 'validades' ? 0 : (stats?.rupturas ?? 0).toLocaleString('pt-BR')}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground text-[11px]">
                <span>Cruzamentos e pendências derivadas:</span>
                <span className="font-bold">
                  {(
                    (stats?.operationalCrossEvidence ?? 0) + (stats?.auditoriaPendencias ?? 0)
                  ).toLocaleString('pt-BR')}
                </span>
              </div>
            </div>

            {/* Escopo Selecionado */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Alvo da limpeza:</Label>
              <RadioGroup
                value={targetType}
                onValueChange={(v: any) => setTargetType(v)}
                className="grid grid-cols-3 gap-2"
              >
                <div>
                  <RadioGroupItem value="all" id="t-all" className="peer sr-only" />
                  <Label
                    htmlFor="t-all"
                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-2 hover:bg-accent peer-data-[state=checked]:border-destructive [&:has([data-state=checked])]:border-destructive cursor-pointer text-center text-[11px]"
                  >
                    Ambas (Validades + Rupturas)
                  </Label>
                </div>
                <div>
                  <RadioGroupItem value="validades" id="t-val" className="peer sr-only" />
                  <Label
                    htmlFor="t-val"
                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-2 hover:bg-accent peer-data-[state=checked]:border-destructive [&:has([data-state=checked])]:border-destructive cursor-pointer text-center text-[11px]"
                  >
                    Apenas Validades
                  </Label>
                </div>
                <div>
                  <RadioGroupItem value="rupturas" id="t-rup" className="peer sr-only" />
                  <Label
                    htmlFor="t-rup"
                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-2 hover:bg-accent peer-data-[state=checked]:border-destructive [&:has([data-state=checked])]:border-destructive cursor-pointer text-center text-[11px]"
                  >
                    Apenas Rupturas
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Confirmação com palavra-chave */}
            <div className="space-y-1.5 pt-2">
              <Label htmlFor="confirm-input" className="text-xs text-foreground font-semibold">
                Para confirmar a exclusão, digite a palavra{' '}
                <span className="text-destructive font-mono font-bold">LIMPAR</span>:
              </Label>
              <Input
                id="confirm-input"
                placeholder="LIMPAR"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                className="font-mono text-center tracking-widest uppercase border-red-300 focus-visible:ring-red-400"
                autoComplete="off"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setModalOpen(false)}
              disabled={executing}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={confirmInput.trim().toUpperCase() !== 'LIMPAR' || executing}
              onClick={handleExecuteCleanup}
              className="gap-1.5"
            >
              {executing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Executando Limpeza...
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  Confirmar Exclusão Definitiva
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
