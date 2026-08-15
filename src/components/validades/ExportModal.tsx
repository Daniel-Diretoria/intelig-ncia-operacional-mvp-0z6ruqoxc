import React from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Download, FileSpreadsheet, FileText, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ValidadeItem } from '@/types'
import { exportarCSV, exportarXLSX } from '@/lib/export/validadesExport'
import { useToast } from '@/hooks/use-toast'

interface ExportModalProps {
  isOpen: boolean
  onClose: () => void
  items: ValidadeItem[]
}

type Format = 'xlsx' | 'csv'

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, items }) => {
  const [selected, setSelected] = React.useState<Format>('xlsx')
  const { toast } = useToast()

  const handleExport = () => {
    try {
      const dateStr = new Date().toISOString().slice(0, 10)
      if (selected === 'xlsx') {
        exportarXLSX(items, `validades_${dateStr}.xlsx`)
      } else {
        exportarCSV(items, `validades_${dateStr}.csv`)
      }
      toast({
        title: 'Exportação concluída',
        description: `${items.length} ocorrência(s) exportada(s) em formato ${selected.toUpperCase()}.`,
      })
      onClose()
    } catch (err) {
      toast({
        title: 'Falha ao exportar',
        description: err instanceof Error ? err.message : 'Erro inesperado na exportação.',
        variant: 'destructive',
      })
    }
  }

  const formats: Array<{
    id: Format
    label: string
    desc: string
    icon: React.ElementType
  }> = [
    {
      id: 'xlsx',
      label: 'Excel (.xlsx)',
      desc: 'Planilha compatível com Microsoft Excel, Google Sheets e LibreOffice.',
      icon: FileSpreadsheet,
    },
    {
      id: 'csv',
      label: 'CSV (.csv)',
      desc: 'Texto separado por ponto e vírgula, abre em qualquer editor.',
      icon: FileText,
    },
  ]

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Exportar visão filtrada"
      description={`${items.length} ocorrência(s) serão exportadas com os filtros ativos.`}
      maxWidth="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} className="h-9">
            Cancelar
          </Button>
          <Button
            onClick={handleExport}
            className="h-9 gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <Download className="w-4 h-4" />
            Exportar
          </Button>
        </>
      }
    >
      <div className="space-y-2.5">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Formato do arquivo
        </p>
        {formats.map((f) => {
          const Icon = f.icon
          const isSel = selected === f.id
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setSelected(f.id)}
              className={cn(
                'w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors',
                isSel
                  ? 'border-indigo-300 bg-indigo-50/60 ring-1 ring-indigo-200'
                  : 'border-slate-200 hover:bg-slate-50',
              )}
            >
              <div
                className={cn(
                  'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                  isSel ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600',
                )}
              >
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900">{f.label}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{f.desc}</p>
              </div>
              {isSel && <Check className="w-4 h-4 text-indigo-600 mt-1 shrink-0" />}
            </button>
          )
        })}
      </div>
    </Modal>
  )
}
