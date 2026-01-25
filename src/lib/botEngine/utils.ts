/**
 * BOT ENGINE - Utilitários
 * Funções auxiliares para o motor de chatbot
 */

import type { BotNode, BotEdge, BotConditionType, BotNodeConfig } from './types';

/**
 * Substitui variáveis em um texto usando o formato {{variavel}}
 */
export function interpolateVariables(
  text: string, 
  variables: Record<string, unknown>
): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    const value = variables[varName];
    if (value === undefined || value === null) return match;
    return String(value);
  });
}

/**
 * Avalia uma condição baseada no tipo e valor
 */
export function evaluateCondition(
  conditionType: BotConditionType,
  conditionValue: string | undefined,
  inputValue: string,
  variables: Record<string, unknown>
): boolean {
  switch (conditionType) {
    case 'always':
      return true;
      
    case 'equals':
      return inputValue.toLowerCase().trim() === (conditionValue || '').toLowerCase().trim();
      
    case 'contains':
      return inputValue.toLowerCase().includes((conditionValue || '').toLowerCase());
      
    case 'regex':
      try {
        const regex = new RegExp(conditionValue || '', 'i');
        return regex.test(inputValue);
      } catch {
        return false;
      }
      
    case 'variable':
      // Formato: "variavel:valor" ou apenas "variavel" (verifica se existe)
      if (!conditionValue) return false;
      const [varName, expectedValue] = conditionValue.split(':');
      const actualValue = variables[varName];
      if (expectedValue === undefined) {
        return actualValue !== undefined && actualValue !== null;
      }
      return String(actualValue).toLowerCase() === expectedValue.toLowerCase();
      
    case 'expression':
      // Expressões customizadas podem ser expandidas no futuro
      return false;
      
    default:
      return false;
  }
}

/**
 * Encontra o próximo nó baseado nas edges e condições
 */
export function findNextNode(
  currentNodeId: string,
  edges: BotEdge[],
  nodes: BotNode[],
  inputValue: string,
  variables: Record<string, unknown>
): BotNode | null {
  // Filtra edges que saem do nó atual, ordenadas por prioridade
  const outgoingEdges = edges
    .filter(e => e.source_node_id === currentNodeId)
    .sort((a, b) => b.priority - a.priority);
  
  for (const edge of outgoingEdges) {
    const passes = evaluateCondition(
      edge.condition_type,
      edge.condition_value,
      inputValue,
      variables
    );
    
    if (passes) {
      const targetNode = nodes.find(n => n.id === edge.target_node_id);
      if (targetNode) return targetNode;
    }
  }
  
  return null;
}

/**
 * Encontra o nó de entrada de um fluxo
 */
export function findEntryNode(nodes: BotNode[]): BotNode | null {
  // Primeiro, procura um nó marcado como entry_point
  const entryPoint = nodes.find(n => n.is_entry_point);
  if (entryPoint) return entryPoint;
  
  // Fallback: procura um nó do tipo 'start'
  const startNode = nodes.find(n => n.node_type === 'start');
  if (startNode) return startNode;
  
  // Último fallback: primeiro nó por data de criação
  const sorted = [...nodes].sort((a, b) => 
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  
  return sorted[0] || null;
}

/**
 * Valida input do usuário baseado na configuração do nó
 */
export function validateInput(
  value: string,
  config: BotNodeConfig
): { valid: boolean; error?: string } {
  const { validation_type, validation_options } = config;
  
  if (!validation_type || validation_type === 'text') {
    return { valid: true };
  }
  
  switch (validation_type) {
    case 'number':
      const num = Number(value);
      if (isNaN(num)) {
        return { valid: false, error: 'Por favor, digite um número válido.' };
      }
      return { valid: true };
      
    case 'email':
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        return { valid: false, error: 'Por favor, digite um e-mail válido.' };
      }
      return { valid: true };
      
    case 'phone':
      const phoneDigits = value.replace(/\D/g, '');
      if (phoneDigits.length < 10 || phoneDigits.length > 13) {
        return { valid: false, error: 'Por favor, digite um telefone válido.' };
      }
      return { valid: true };
      
    case 'date':
      // Aceita dd/mm/yyyy ou yyyy-mm-dd
      const dateRegex = /^(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})$/;
      if (!dateRegex.test(value)) {
        return { valid: false, error: 'Por favor, digite uma data válida (dd/mm/aaaa).' };
      }
      return { valid: true };
      
    case 'option':
      if (!validation_options || validation_options.length === 0) {
        return { valid: true };
      }
      const normalizedValue = value.toLowerCase().trim();
      const validOption = validation_options.some(
        opt => opt.toLowerCase().trim() === normalizedValue
      );
      if (!validOption) {
        return { 
          valid: false, 
          error: `Opção inválida. Escolha entre: ${validation_options.join(', ')}` 
        };
      }
      return { valid: true };
      
    default:
      return { valid: true };
  }
}

/**
 * Normaliza número de telefone para formato padrão
 */
export function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  
  // Adiciona DDI 55 se não existir
  if (!digits.startsWith('55') && digits.length >= 10 && digits.length <= 11) {
    digits = '55' + digits;
  }
  
  return digits;
}

/**
 * Gera ID único para nós/edges no editor visual
 */
export function generateNodeId(): string {
  return `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Gera ID único para edges
 */
export function generateEdgeId(): string {
  return `edge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Clona um nó com novo ID
 */
export function cloneNode(node: BotNode, offsetX = 50, offsetY = 50): Partial<BotNode> {
  return {
    ...node,
    id: generateNodeId(),
    name: node.name ? `${node.name} (cópia)` : undefined,
    position_x: node.position_x + offsetX,
    position_y: node.position_y + offsetY,
    is_entry_point: false, // Cópia nunca é entry point
  };
}
