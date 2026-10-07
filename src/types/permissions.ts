/**
 * SKIP — Definição de Permissões, Perfis e Controle de Acesso (RBAC + Escopo)
 * v0.0.121
 */

export type UserRole =
  | 'admin'
  | 'gestao'
  | 'operacao'
  | 'supervisao'
  | 'desenvolvedor'
  | 'industria'
export type UserStatus = 'ativo' | 'inativo'
export type UserType = 'humano' | 'integracao'

/**
 * Permissões atômicas granulares do sistema SKIP
 */
export type PermissionKey =
  // Início / Central
  | 'central:visualizar'
  // Operação geral
  | 'operacao:visualizar'
  | 'operacao:registrar'
  | 'operacao:editar'
  | 'operacao:excluir'
  // Validades
  | 'validades:visualizar'
  | 'validades:tratar'
  // Rupturas
  | 'rupturas:visualizar'
  | 'rupturas:tratar'
  // Devoluções / NF
  | 'devolucoes:visualizar'
  | 'devolucoes:criar'
  | 'devolucoes:importar_whatsapp'
  | 'devolucoes:ver_mensagens_brutas'
  | 'devolucoes:executar_decisao'
  | 'devolucoes:registrar_autorizacao'
  | 'devolucoes:visualizar_documentos'
  | 'devolucoes:anexar_documentos'
  | 'devolucoes:visualizar_financeiro'
  // Cadastros Mestres
  | 'cadastros:visualizar'
  | 'cadastros:editar'
  // Indústrias
  | 'industrias:visualizar'
  | 'industrias:editar'
  | 'industrias:editar_cadastro'
  | 'industrias:alterar_mix'
  | 'industrias:alterar_pesquisas'
  | 'industrias:alterar_politicas'
  // Rede / Lojas
  | 'rede:visualizar'
  | 'rede:editar'
  // Inteligência & Relatórios
  | 'inteligencia:visualizar'
  | 'inteligencia:exportar'
  // Integrações (TradePro, etc.)
  | 'integracoes:visualizar'
  | 'integracoes:visualizar_credenciais'
  | 'integracoes:testar_conexao'
  | 'integracoes:sincronizar'
  | 'integracoes:alterar_credenciais'
  // Administração
  | 'admin:gerenciar_usuarios'
  | 'admin:gerenciar_perfis'
  | 'admin:visualizar_auditoria'

export interface PermissionDefinition {
  key: PermissionKey
  label: string
  area: string
  description: string
  sensitive?: boolean
}

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  // Início
  {
    key: 'central:visualizar',
    label: 'Visualizar Central',
    area: 'Início',
    description: 'Acessar a Central de Trabalho e indicadores consolidados',
  },
  // Operação
  {
    key: 'operacao:visualizar',
    label: 'Visualizar Operação',
    area: 'Operação',
    description: 'Consultar filas e dados operacionais',
  },
  {
    key: 'operacao:registrar',
    label: 'Registrar Dados Operacionais',
    area: 'Operação',
    description: 'Incluir novas ocorrências operacionais',
  },
  {
    key: 'operacao:editar',
    label: 'Editar Dados Operacionais',
    area: 'Operação',
    description: 'Modificar registros e status operacionais',
  },
  {
    key: 'operacao:excluir',
    label: 'Excluir Registros',
    area: 'Operação',
    description: 'Remover itens e ocorrências operacionais',
    sensitive: true,
  },
  // Validades
  {
    key: 'validades:visualizar',
    label: 'Visualizar Validades',
    area: 'Validades',
    description: 'Acessar a lista e filtros de validades',
  },
  {
    key: 'validades:tratar',
    label: 'Tratar Validades',
    area: 'Validades',
    description: 'Sinalizar correções e auditorias de validades',
  },
  // Rupturas
  {
    key: 'rupturas:visualizar',
    label: 'Visualizar Rupturas',
    area: 'Rupturas',
    description: 'Consultar rupturas e cruzamento de evidências',
  },
  {
    key: 'rupturas:tratar',
    label: 'Tratar Rupturas',
    area: 'Rupturas',
    description: 'Resolver ou justificar rupturas operacionais',
  },
  // Devoluções / NF
  {
    key: 'devolucoes:visualizar',
    label: 'Visualizar Casos de Devoluções',
    area: 'Devoluções / NF',
    description: 'Consultar filas e casos de devolução',
  },
  {
    key: 'devolucoes:criar',
    label: 'Criar Solicitações de Devolução',
    area: 'Devoluções / NF',
    description: 'Registrar nova solicitação avulsa',
  },
  {
    key: 'devolucoes:importar_whatsapp',
    label: 'Importar Mensagens WhatsApp',
    area: 'Devoluções / NF',
    description: 'Carregar conversas e extrair devoluções',
    sensitive: true,
  },
  {
    key: 'devolucoes:ver_mensagens_brutas',
    label: 'Visualizar Mensagens Brutas WhatsApp',
    area: 'Devoluções / NF',
    description: 'Visualizar conversa integral e números de telefone',
    sensitive: true,
  },
  {
    key: 'devolucoes:executar_decisao',
    label: 'Executar Decisões de Devolução',
    area: 'Devoluções / NF',
    description: 'Aprovar, rejeitar ou registrar divergências em itens',
  },
  {
    key: 'devolucoes:registrar_autorizacao',
    label: 'Registrar Autorização da Indústria',
    area: 'Devoluções / NF',
    description: 'Inserir número de protocolo e autorização formal',
  },
  {
    key: 'devolucoes:visualizar_documentos',
    label: 'Visualizar Documentos e NFs',
    area: 'Devoluções / NF',
    description: 'Abrir notas fiscais, NFs assinadas e fotos de descarte',
    sensitive: true,
  },
  {
    key: 'devolucoes:anexar_documentos',
    label: 'Anexar Documentos e NFs',
    area: 'Devoluções / NF',
    description: 'Enviar arquivos de NF e evidências ao caso',
  },
  {
    key: 'devolucoes:visualizar_financeiro',
    label: 'Visualizar Valores Financeiros',
    area: 'Devoluções / NF',
    description: 'Consultar valores monetários (R$) solicitados e autorizados',
    sensitive: true,
  },
  // Indústrias
  {
    key: 'industrias:visualizar',
    label: 'Visualizar Indústrias',
    area: 'Indústrias',
    description: 'Consultar listagem e detalhes das indústrias cadastradas',
  },
  {
    key: 'industrias:editar_cadastro',
    label: 'Editar Cadastro da Indústria',
    area: 'Indústrias',
    description: 'Modificar dados cadastrais e contatos',
  },
  {
    key: 'industrias:alterar_mix',
    label: 'Alterar Mix de Produtos',
    area: 'Indústrias',
    description: 'Incluir ou remover itens do mix oficial e mix por loja',
  },
  {
    key: 'industrias:alterar_pesquisas',
    label: 'Alterar Pesquisas Obrigatórias',
    area: 'Indústrias',
    description: 'Configurar frequência, dias esperados e ciclos',
  },
  {
    key: 'industrias:alterar_politicas',
    label: 'Alterar Políticas de Criticidade',
    area: 'Indústrias',
    description: 'Ajustar faixas de dias para crítico, atenção e moderado',
  },
  // Cadastros Mestres
  {
    key: 'cadastros:visualizar',
    label: 'Visualizar Cadastros Mestres',
    area: 'Cadastros',
    description:
      'Consultar cadastros de indústrias, produtos, redes, lojas, promotores e supervisores',
  },
  {
    key: 'cadastros:editar',
    label: 'Editar Cadastros Mestres',
    area: 'Cadastros',
    description: 'Criar e atualizar entidades cadastrais e resolver pendências estruturais',
    sensitive: true,
  },
  // Rede / Lojas
  {
    key: 'rede:visualizar',
    label: 'Visualizar Lojas e Rede',
    area: 'Rede',
    description: 'Consultar lojas, promotores e redes',
  },
  {
    key: 'rede:editar',
    label: 'Editar Lojas e Redes',
    area: 'Rede',
    description: 'Atualizar cadastros e códigos de lojas',
  },
  // Inteligência & Relatórios
  {
    key: 'inteligencia:visualizar',
    label: 'Visualizar Inteligência e Auditoria',
    area: 'Inteligência',
    description: 'Acessar Visão Estratégica, Alertas e Auditoria Geral',
  },
  {
    key: 'inteligencia:exportar',
    label: 'Exportar Relatórios e Planilhas',
    area: 'Inteligência',
    description: 'Gerar relatórios em Excel e PDF',
  },
  // Integrações
  {
    key: 'integracoes:visualizar',
    label: 'Visualizar Área de Importação',
    area: 'Integrações',
    description: 'Acessar painel de importação e status de jobs',
  },
  {
    key: 'integracoes:visualizar_credenciais',
    label: 'Visualizar Credenciais / Config Sensível',
    area: 'Integrações',
    description: 'Acesso a detalhes de tokens e conexões',
    sensitive: true,
  },
  {
    key: 'integracoes:testar_conexao',
    label: 'Testar Conexão TradePro',
    area: 'Integrações',
    description: 'Disparar job controlado de teste de conectividade',
  },
  {
    key: 'integracoes:sincronizar',
    label: 'Sincronizar Dados TradePro',
    area: 'Integrações',
    description: 'Executar jobs de importação e sincronização TradePro',
    sensitive: true,
  },
  {
    key: 'integracoes:alterar_credenciais',
    label: 'Alterar Credenciais de Integração',
    area: 'Integrações',
    description: 'Atualizar segredos ou tokens de integração',
    sensitive: true,
  },
  // Administração
  {
    key: 'admin:gerenciar_usuarios',
    label: 'Gerenciar Usuários e Acessos',
    area: 'Administração',
    description: 'Criar, desativar e alterar perfis de usuários',
    sensitive: true,
  },
  {
    key: 'admin:gerenciar_perfis',
    label: 'Gerenciar Permissões e Matriz',
    area: 'Administração',
    description: 'Conceder e revogar permissões atômicas',
    sensitive: true,
  },
  {
    key: 'admin:visualizar_auditoria',
    label: 'Visualizar Auditoria Administrativa',
    area: 'Administração',
    description: 'Consultar histórico de quem alterou acessos e cadastros',
    sensitive: true,
  },
]

/**
 * Matriz de Permissões Padrão por Perfil
 */
export const ROLE_DEFAULT_PERMISSIONS: Record<UserRole, PermissionKey[]> = {
  admin: PERMISSION_DEFINITIONS.map((p) => p.key),

  gestao: [
    'central:visualizar',
    'operacao:visualizar',
    'cadastros:visualizar',
    'cadastros:editar',
    'validades:visualizar',
    'rupturas:visualizar',
    'devolucoes:visualizar',
    'devolucoes:visualizar_documentos',
    'devolucoes:visualizar_financeiro',
    'industrias:visualizar',
    'rede:visualizar',
    'inteligencia:visualizar',
    'inteligencia:exportar',
    'integracoes:visualizar',
    'integracoes:testar_conexao',
  ],

  operacao: [
    'central:visualizar',
    'operacao:visualizar',
    'cadastros:visualizar',
    'operacao:registrar',
    'operacao:editar',
    'validades:visualizar',
    'validades:tratar',
    'rupturas:visualizar',
    'rupturas:tratar',
    'devolucoes:visualizar',
    'devolucoes:criar',
    'devolucoes:importar_whatsapp',
    'devolucoes:ver_mensagens_brutas',
    'devolucoes:executar_decisao',
    'devolucoes:registrar_autorizacao',
    'devolucoes:visualizar_documentos',
    'devolucoes:anexar_documentos',
    'industrias:visualizar',
    'rede:visualizar',
    'inteligencia:visualizar',
    'inteligencia:exportar',
    'integracoes:visualizar',
  ],

  supervisao: [
    'central:visualizar',
    'operacao:visualizar',
    'cadastros:visualizar',
    'validades:visualizar',
    'validades:tratar',
    'rupturas:visualizar',
    'rupturas:tratar',
    'devolucoes:visualizar',
    'devolucoes:criar',
    'devolucoes:anexar_documentos',
    'industrias:visualizar',
    'rede:visualizar',
    'inteligencia:visualizar',
    'inteligencia:exportar',
  ],

  desenvolvedor: [
    'central:visualizar',
    'operacao:visualizar',
    'cadastros:visualizar',
    'validades:visualizar',
    'rupturas:visualizar',
    'devolucoes:visualizar', // Vê fila de devoluções sem docs/valores sensíveis
    'industrias:visualizar',
    'rede:visualizar',
    'inteligencia:visualizar',
    'integracoes:visualizar', // Vê tela de importação em leitura
  ],

  industria: [
    'central:visualizar',
    'cadastros:visualizar',
    'validades:visualizar',
    'rupturas:visualizar',
    'devolucoes:visualizar',
    'devolucoes:visualizar_documentos',
    'industrias:visualizar',
    'inteligencia:visualizar',
  ],
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  gestao: 'Gestão',
  operacao: 'Inteligência / Operação',
  supervisao: 'Supervisão',
  desenvolvedor: 'Desenvolvedor / Integrador',
  industria: 'Indústria / Cliente',
}

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin:
    'Acesso completo ao sistema, administração de usuários, credenciais, configurações e auditoria.',
  gestao:
    'Visualização gerencial ampla da operação e relatórios. Sem administração de credenciais ou usuários.',
  operacao:
    'Operação diária completa: filas de validades, rupturas, devoluções, importação WhatsApp e tratativas.',
  supervisao: 'Acompanhamento da operação e lojas sob sua alçada.',
  desenvolvedor:
    'Acesso predominantemente de leitura para entendimento da arquitetura e preparação de integrações. Bloqueado para dados financeiros, documentos sensíveis, alterações operacionais e credenciais.',
  industria: 'Acesso restrito e focado exclusivamente nos dados autorizados da sua indústria.',
}

export interface CustomPermissionsPayload {
  granted: PermissionKey[]
  revoked: PermissionKey[]
}

/**
 * Calcula a lista efetiva de permissões de um usuário, combinando seu perfil padrão
 * com eventuais permissões concedidas ou revogadas individualmente.
 */
export function computeEffectivePermissions(
  role: UserRole = 'operacao',
  customPermissions?: CustomPermissionsPayload | null,
): Set<PermissionKey> {
  const base = new Set<PermissionKey>(ROLE_DEFAULT_PERMISSIONS[role] || [])

  if (customPermissions) {
    if (Array.isArray(customPermissions.granted)) {
      for (const p of customPermissions.granted) {
        base.add(p)
      }
    }
    if (Array.isArray(customPermissions.revoked)) {
      for (const p of customPermissions.revoked) {
        base.delete(p)
      }
    }
  }

  return base
}

/**
 * Verifica se um conjunto de permissões atende a uma permissão requerida
 */
export function hasPermission(
  effectivePermissions: Set<PermissionKey>,
  requiredPermission: PermissionKey,
): boolean {
  return effectivePermissions.has(requiredPermission)
}

/**
 * Verifica se o usuário tem acesso a uma determinada indústria com base no escopo
 * - allowedIndustries vazio ou indefinido: acesso total a todas as indústrias (padrão administrativo e de equipe interna)
 * - allowedIndustries com itens: restrito APENAS às indústrias listadas (por ID ou Nome canônico)
 */
export function isIndustryAllowed(
  allowedIndustries: string[] | undefined | null,
  industryIdentifier: { id?: string; name?: string },
): boolean {
  if (!allowedIndustries || allowedIndustries.length === 0) {
    return true
  }

  const normalizedAllowed = allowedIndustries.map((i) => i.trim().toUpperCase())

  if (
    industryIdentifier.id &&
    normalizedAllowed.includes(industryIdentifier.id.trim().toUpperCase())
  ) {
    return true
  }

  if (
    industryIdentifier.name &&
    normalizedAllowed.includes(industryIdentifier.name.trim().toUpperCase())
  ) {
    return true
  }

  return false
}
