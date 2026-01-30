# Sistema Global de Fechamento de Modais

**Data de Implementação:** 2026-01-30  
**Versão:** 1.0.0

---

## Visão Geral

O sistema implementa uma arquitetura centralizada para fechamento de **todos os overlays** da aplicação (Dialog, Sheet, Drawer, AlertDialog) através de um único estado global. Esta abordagem resolve problemas de responsividade em dispositivos móveis e garante comportamento consistente em todos os cenários.

---

## Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                    GlobalModalCloseProvider                      │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Estado Global:                                              ││
│  │  - shouldClose: boolean                                      ││
│  │  - closeId: number (contador único)                          ││
│  │  - triggerClose(): dispara fechamento                        ││
│  │  - resetClose(): limpa estado                                ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
      ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
      │    Dialog    │ │    Sheet     │ │   Drawer     │
      │  (observa)   │ │  (observa)   │ │  (observa)   │
      └──────────────┘ └──────────────┘ └──────────────┘
              ▲               ▲               ▲
              │               │               │
              └───────────────┼───────────────┘
                              │
                    ┌─────────────────┐
                    │ CloseButtonGlobal│
                    │ (dispara estado) │
                    └─────────────────┘
```

---

## Regras Fundamentais

1. **Nenhum botão X fecha modal diretamente**
2. **Todo botão X apenas chama `triggerClose()`**
3. **Todos os modais observam `shouldClose` e fecham quando true**
4. **Após fechar, o modal chama `resetClose()` para limpar o estado**
5. **O backdrop e botão voltar também usam `triggerClose()`**

---

## Componentes do Sistema

### 1. GlobalModalCloseContext (`src/contexts/GlobalModalCloseContext.tsx`)

Contexto React que gerencia o estado global de fechamento.

```typescript
interface GlobalModalCloseContextValue {
  shouldClose: boolean;      // Quando true, modais devem fechar
  closeId: number;           // Contador para garantir unicidade
  triggerClose: () => void;  // Dispara fechamento global
  resetClose: () => void;    // Reseta estado após fechamento
}
```

**Funcionalidades:**
- Intercepta botão "Voltar" do navegador via `popstate`
- Mantém contador `closeId` para evitar re-processamento
- Provider deve envolver toda a aplicação

### 2. CloseButtonGlobal (`src/components/ui/close-button-global.tsx`)

Botão de fechamento padronizado para todos os overlays.

**Características:**
- Tamanho mínimo 48x48px (acessibilidade Android)
- `z-index: 9999` com `isolation: isolate`
- Suprime menu de contexto em long-press
- Usa `stopPropagation` para isolar eventos
- Dispara `triggerClose()` ao invés de fechar diretamente

### 3. Overlays Observadores

Cada overlay (Dialog, Sheet, Drawer, AlertDialog) observa o estado global:

```typescript
React.useEffect(() => {
  if (!globalClose) return;
  
  const { shouldClose, closeId, resetClose } = globalClose;
  
  if (shouldClose && closeId > lastCloseIdRef.current) {
    lastCloseIdRef.current = closeId;
    
    // Encontra e clica no botão interno do Radix/Vaul
    const closeButton = contentRef.current?.querySelector('[data-radix-dialog-close]');
    if (closeButton) closeButton.click();
    
    setTimeout(() => resetClose(), 50);
  }
}, [globalClose?.shouldClose, globalClose?.closeId, globalClose?.resetClose]);
```

---

## Arquivos Modificados

| Arquivo | Alteração |
|---------|-----------|
| `src/contexts/GlobalModalCloseContext.tsx` | **NOVO** - Contexto global |
| `src/components/ui/close-button-global.tsx` | Refatorado para usar contexto |
| `src/components/ui/dialog.tsx` | Adicionado observador global |
| `src/components/ui/sheet.tsx` | Adicionado observador global |
| `src/components/ui/drawer.tsx` | Adicionado observador global |
| `src/components/ui/alert-dialog.tsx` | Adicionado observador global |
| `src/components/ui/managed-dialog.tsx` | Simplificado (wrapper) |
| `src/components/ui/managed-sheet.tsx` | Simplificado (wrapper) |
| `src/components/ui/managed-drawer.tsx` | Simplificado (wrapper) |
| `src/App.tsx` | Adicionado GlobalModalCloseProvider |

---

## Sistema Legado Descontinuado

Os seguintes componentes foram simplificados e não mais gerenciam pilhas:

- `useModalStack` - Agora é apenas um no-op de compatibilidade
- `ManagedDialog/Sheet/Drawer` - Agora são wrappers simples
- `useModalBackButtonHandler` - Removido do AppInitializer

---

## Integração com Hardware

### Botão Voltar (Android/PWA)

O contexto intercepta o evento `popstate` e dispara `triggerClose()`:

```typescript
React.useEffect(() => {
  const handlePopState = (event: PopStateEvent) => {
    console.log('[GlobalModalClose] Back button detected, triggering close');
    triggerClose();
    window.history.pushState(null, '', window.location.href);
  };

  window.history.pushState(null, '', window.location.href);
  window.addEventListener('popstate', handlePopState);
  return () => window.removeEventListener('popstate', handlePopState);
}, [triggerClose]);
```

### Tecla ESC

Gerenciada nativamente pelo Radix UI (Dialog/AlertDialog) e Vaul (Drawer).

---

## Uso em Novos Componentes

### Para novos overlays customizados:

```typescript
import { useGlobalModalCloseSafe } from "@/contexts/GlobalModalCloseContext";

function CustomOverlay({ onClose }) {
  const globalClose = useGlobalModalCloseSafe();
  const lastCloseIdRef = React.useRef<number>(0);

  React.useEffect(() => {
    if (!globalClose) return;
    
    const { shouldClose, closeId, resetClose } = globalClose;
    
    if (shouldClose && closeId > lastCloseIdRef.current) {
      lastCloseIdRef.current = closeId;
      onClose(); // Fecha o overlay
      setTimeout(() => resetClose(), 50);
    }
  }, [globalClose?.shouldClose, globalClose?.closeId, onClose]);

  return (
    <div>
      <CloseButtonGlobal />
      {/* conteúdo */}
    </div>
  );
}
```

---

## Testes Recomendados

1. **Fluxo Clientes → Editar/Renovar** no Android/PWA
2. **Botão X** em todos os tipos de overlay
3. **Botão Voltar** do navegador/dispositivo
4. **Tecla ESC** em desktop
5. **ConfirmDialog** (diálogos de confirmação)

---

## Troubleshooting

| Problema | Causa Provável | Solução |
|----------|----------------|---------|
| Modal não fecha | Observador não implementado | Verificar useEffect com globalClose |
| Modal fecha duas vezes | closeId não verificado | Adicionar lastCloseIdRef |
| Botão X sem resposta | Falta pointer-events | Verificar CSS do CloseButtonGlobal |
| Voltar navega ao invés de fechar | popstate não interceptado | Verificar Provider na árvore |

---

## Memórias Relacionadas

- `memory/style/ui/modal-close-button-standard-v5-complete`
- `memory/architecture/navigation/global-stack-manager`
- `memory/technical/ui/portal-conflict-resolution`
