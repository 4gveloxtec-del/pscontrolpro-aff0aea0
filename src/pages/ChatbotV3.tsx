import { useState } from "react";
import { useChatbotV3 } from "@/hooks/useChatbotV3";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Bot, Settings, Menu as MenuIcon, Zap, Variable, 
  Plus, Trash2, ChevronRight, PlayCircle, ChevronDown, FolderTree, FolderPlus
} from "lucide-react";
import { toast } from "sonner";

export default function ChatbotV3() {
  const {
    config,
    menus,
    options,
    triggers,
    variables,
    isLoading,
    updateConfig,
    createMenu,
    updateMenu,
    deleteMenu,
    createOption,
    updateOption,
    deleteOption,
    updateTrigger,
    updateVariable,
    getMenuOptions,
    replaceVariables,
  } = useChatbotV3();

  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isAddOptionOpen, setIsAddOptionOpen] = useState(false);
  const [isAddSubmenuOpen, setIsAddSubmenuOpen] = useState(false);
  const [simulatorInput, setSimulatorInput] = useState("");
  const [simulatorHistory, setSimulatorHistory] = useState<Array<{ from: "user" | "bot"; text: string }>>([]);
  const [simulatorMenuKey, setSimulatorMenuKey] = useState("main");
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set(["main"]));

  // New menu form
  const [newMenu, setNewMenu] = useState({
    menu_key: "",
    title: "",
    message_text: "",
    parent_menu_key: "__root__",
  });

  // New submenu form (for creating child menus)
  const [newSubmenu, setNewSubmenu] = useState({
    menu_key: "",
    title: "",
    message_text: "",
  });

  // New option form
  const [newOption, setNewOption] = useState({
    option_number: 1,
    option_text: "",
    keywords: "",
    target_menu_key: "__none__",
    action_type: "menu",
    action_response: "",
  });

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  const selectedMenu = menus.find(m => m.id === selectedMenuId);
  const menuOptionsForSelected = selectedMenuId ? getMenuOptions(selectedMenuId) : [];

  // Simulator logic
  const handleSimulatorSend = () => {
    if (!simulatorInput.trim()) return;
    
    const userMessage = simulatorInput.trim();
    setSimulatorHistory(prev => [...prev, { from: "user", text: userMessage }]);
    setSimulatorInput("");
    
    // Process message
    const normalizedInput = userMessage.toLowerCase();
    
    // Check triggers first
    for (const trigger of triggers.filter(t => t.is_active)) {
      if (trigger.keywords.some(kw => normalizedInput.includes(kw.toLowerCase()))) {
        if (trigger.action_type === "goto_menu" && trigger.target_menu_key) {
          const targetMenu = menus.find(m => m.menu_key === trigger.target_menu_key);
          if (targetMenu) {
            setSimulatorHistory(prev => [...prev, { from: "bot", text: replaceVariables(targetMenu.message_text) }]);
            setSimulatorMenuKey(targetMenu.menu_key);
            return;
          }
        }
        if (trigger.action_type === "message" && trigger.response_text) {
          setSimulatorHistory(prev => [...prev, { from: "bot", text: replaceVariables(trigger.response_text) }]);
          return;
        }
        if (trigger.action_type === "human") {
          setSimulatorHistory(prev => [...prev, { from: "bot", text: "Aguarde, você será atendido por um de nossos atendentes. 👤" }]);
          return;
        }
      }
    }
    
    // Check current menu options
    const currentMenu = menus.find(m => m.menu_key === simulatorMenuKey);
    if (currentMenu) {
      const menuOpts = options.filter(o => o.menu_id === currentMenu.id && o.is_active);
      
      // Check by number
      const numMatch = normalizedInput.match(/^(\d+)/);
      if (numMatch) {
        const num = parseInt(numMatch[1]);
        const matchedOpt = menuOpts.find(o => o.option_number === num);
        if (matchedOpt) {
          handleOptionAction(matchedOpt);
          return;
        }
      }
      
      // Check by keyword
      for (const opt of menuOpts) {
        if (opt.keywords?.some(kw => normalizedInput.includes(kw.toLowerCase()))) {
          handleOptionAction(opt);
          return;
        }
      }
    }
    
    // Fallback
    setSimulatorHistory(prev => [...prev, { from: "bot", text: config?.fallback_message || "Não entendi 😕" }]);
  };

  const handleOptionAction = (opt: typeof options[0]) => {
    if (opt.action_type === "menu" && opt.target_menu_key) {
      const targetMenu = menus.find(m => m.menu_key === opt.target_menu_key);
      if (targetMenu) {
        setSimulatorHistory(prev => [...prev, { from: "bot", text: replaceVariables(targetMenu.message_text) }]);
        setSimulatorMenuKey(targetMenu.menu_key);
      }
    } else if (opt.action_type === "message") {
      setSimulatorHistory(prev => [...prev, { from: "bot", text: replaceVariables(opt.action_response || "Mensagem recebida!") }]);
    } else if (opt.action_type === "human") {
      setSimulatorHistory(prev => [...prev, { from: "bot", text: replaceVariables(opt.action_response || "Aguarde, você será atendido. 👤") }]);
    } else if (opt.action_type === "end") {
      setSimulatorHistory(prev => [...prev, { from: "bot", text: replaceVariables(opt.action_response || "Obrigado pelo contato! 👋") }]);
      setSimulatorMenuKey("main");
    }
  };

  const handleAddMenu = async () => {
    if (!newMenu.menu_key || !newMenu.title || !newMenu.message_text) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    
    const parentKey = newMenu.parent_menu_key === "__root__" ? null : newMenu.parent_menu_key;
    
    const result = await createMenu({
      menu_key: newMenu.menu_key.toLowerCase().replace(/\s/g, "_"),
      title: newMenu.title,
      message_text: newMenu.message_text,
      image_url: null,
      parent_menu_key: parentKey,
      sort_order: menus.length,
      is_active: true,
    });
    
    if (result) {
      setIsAddMenuOpen(false);
      setNewMenu({ menu_key: "", title: "", message_text: "", parent_menu_key: "__root__" });
      // Expand parent menu to show the new submenu
      if (parentKey) {
        setExpandedMenus(prev => new Set([...prev, parentKey]));
      }
    }
  };

  const handleAddSubmenu = async () => {
    if (!selectedMenu || !newSubmenu.menu_key || !newSubmenu.title || !newSubmenu.message_text) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    
    const result = await createMenu({
      menu_key: newSubmenu.menu_key.toLowerCase().replace(/\s/g, "_"),
      title: newSubmenu.title,
      message_text: newSubmenu.message_text,
      image_url: null,
      parent_menu_key: selectedMenu.menu_key,
      sort_order: menus.filter(m => m.parent_menu_key === selectedMenu.menu_key).length,
      is_active: true,
    });
    
    if (result) {
      setIsAddSubmenuOpen(false);
      setNewSubmenu({ menu_key: "", title: "", message_text: "" });
      // Expand current menu to show the new submenu
      setExpandedMenus(prev => new Set([...prev, selectedMenu.menu_key]));
      toast.success(`Submenu criado dentro de "${selectedMenu.title}"`);
    }
  };

  const toggleMenuExpand = (menuKey: string) => {
    setExpandedMenus(prev => {
      const newSet = new Set(prev);
      if (newSet.has(menuKey)) {
        newSet.delete(menuKey);
      } else {
        newSet.add(menuKey);
      }
      return newSet;
    });
  };

  // Get child menus for a given parent
  const getChildMenus = (parentKey: string | null) => {
    return menus.filter(m => m.parent_menu_key === parentKey);
  };

  // Render menu tree recursively
  const renderMenuTree = (parentKey: string | null, level: number = 0): JSX.Element[] => {
    const childMenus = getChildMenus(parentKey);
    
    return childMenus.map(menu => {
      const hasChildren = menus.some(m => m.parent_menu_key === menu.menu_key);
      const isExpanded = expandedMenus.has(menu.menu_key);
      const isSelected = selectedMenuId === menu.id;
      
      return (
        <div key={menu.id}>
          <div
            className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
              isSelected ? "bg-primary/10 border border-primary" : "hover:bg-muted"
            }`}
            style={{ marginLeft: level * 16 }}
            onClick={() => setSelectedMenuId(menu.id)}
          >
            {hasChildren ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMenuExpand(menu.menu_key);
                }}
                className="p-0.5 hover:bg-muted-foreground/20 rounded"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
            ) : (
              <span className="w-5" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{menu.title}</p>
              <p className="text-xs text-muted-foreground truncate">{menu.menu_key}</p>
            </div>
            {menu.menu_key === "main" && (
              <Badge variant="secondary" className="text-xs">Principal</Badge>
            )}
            {hasChildren && (
              <Badge variant="outline" className="text-xs">
                {menus.filter(m => m.parent_menu_key === menu.menu_key).length}
              </Badge>
            )}
          </div>
          {hasChildren && isExpanded && (
            <div className="mt-1">
              {renderMenuTree(menu.menu_key, level + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  const handleAddOption = async () => {
    if (!selectedMenuId || !newOption.option_text.trim()) {
      toast.error("Preencha o texto da opção");
      return;
    }
    
    // Validar menu destino quando ação é "menu"
    const targetKey = newOption.target_menu_key === "__none__" ? null : newOption.target_menu_key;
    if (newOption.action_type === "menu" && !targetKey) {
      toast.error("Selecione o menu de destino");
      return;
    }
    
    const result = await createOption({
      menu_id: selectedMenuId,
      option_number: newOption.option_number,
      option_text: newOption.option_text.trim(),
      keywords: newOption.keywords.split(",").map(k => k.trim()).filter(Boolean),
      target_menu_key: newOption.action_type === "menu" ? targetKey : null,
      action_type: newOption.action_type,
      action_response: newOption.action_type !== "menu" ? newOption.action_response : null,
      sort_order: menuOptionsForSelected.length,
      is_active: true,
    });
    
    if (result) {
      setIsAddOptionOpen(false);
      setNewOption({
        option_number: menuOptionsForSelected.length + 2,
        option_text: "",
        keywords: "",
        target_menu_key: "__none__",
        action_type: "menu",
        action_response: "",
      });
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-7xl">
        <div className="flex items-center gap-3 mb-6">
          <Bot className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Chatbot V3</h1>
            <p className="text-muted-foreground">Auto-responder profissional</p>
          </div>
          <div className="ml-auto">
            <Switch
              checked={config?.is_enabled ?? true}
              onCheckedChange={(checked) => updateConfig({ is_enabled: checked })}
            />
            <span className="ml-2 text-sm">{config?.is_enabled ? "Ativo" : "Inativo"}</span>
          </div>
        </div>

        <Tabs defaultValue="menus" className="space-y-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="menus" className="gap-2">
              <MenuIcon className="h-4 w-4" /> Menus
            </TabsTrigger>
            <TabsTrigger value="triggers" className="gap-2">
              <Zap className="h-4 w-4" /> Gatilhos
            </TabsTrigger>
            <TabsTrigger value="variables" className="gap-2">
              <Variable className="h-4 w-4" /> Variáveis
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2">
              <Settings className="h-4 w-4" /> Config
            </TabsTrigger>
            <TabsTrigger value="simulator" className="gap-2">
              <PlayCircle className="h-4 w-4" /> Testar
            </TabsTrigger>
          </TabsList>

          {/* MENUS TAB */}
          <TabsContent value="menus" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Menu Tree */}
              <Card className="md:col-span-1">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FolderTree className="h-4 w-4" />
                      Menus
                    </div>
                    <Dialog open={isAddMenuOpen} onOpenChange={setIsAddMenuOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline" title="Novo menu">
                          <Plus className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Novo Menu</DialogTitle>
                          <DialogDescription>Crie um novo menu ou submenu no chatbot</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <Label>Chave do Menu *</Label>
                            <Input
                              placeholder="ex: planos_mensais"
                              value={newMenu.menu_key}
                              onChange={(e) => setNewMenu({ ...newMenu, menu_key: e.target.value })}
                            />
                            <p className="text-xs text-muted-foreground mt-1">Identificador único, sem espaços</p>
                          </div>
                          <div>
                            <Label>Título *</Label>
                            <Input
                              placeholder="ex: Planos Mensais"
                              value={newMenu.title}
                              onChange={(e) => setNewMenu({ ...newMenu, title: e.target.value })}
                            />
                          </div>
                          <div>
                            <Label>Menu Pai (onde ficará dentro)</Label>
                            <Select
                              value={newMenu.parent_menu_key}
                              onValueChange={(v) => setNewMenu({ ...newMenu, parent_menu_key: v })}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__root__">🔝 Nível Raiz (sem pai)</SelectItem>
                                {menus.map(m => (
                                  <SelectItem key={m.id} value={m.menu_key}>
                                    {m.parent_menu_key ? `└─ ${m.title}` : m.title}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground mt-1">
                              Selecione onde este menu ficará na árvore
                            </p>
                          </div>
                          <div>
                            <Label>Mensagem *</Label>
                            <Textarea
                              placeholder="Texto que será enviado quando este menu for acessado"
                              value={newMenu.message_text}
                              onChange={(e) => setNewMenu({ ...newMenu, message_text: e.target.value })}
                              rows={5}
                            />
                            <p className="text-xs text-muted-foreground mt-1">Use {"{empresa}"}, {"{pix}"}, etc para variáveis</p>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setIsAddMenuOpen(false)}>Cancelar</Button>
                          <Button onClick={handleAddMenu}>Criar Menu</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </CardTitle>
                  <CardDescription>
                    Clique para editar • Seta para expandir submenus
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-1 max-h-[500px] overflow-y-auto">
                  {renderMenuTree(null)}
                  {menus.length === 0 && (
                    <p className="text-center text-muted-foreground py-4 text-sm">
                      Nenhum menu criado
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Menu Editor */}
              <Card className="md:col-span-2">
                {selectedMenu ? (
                  <>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {selectedMenu.title}
                          {selectedMenu.parent_menu_key && (
                            <Badge variant="outline" className="text-xs font-normal">
                              filho de: {selectedMenu.parent_menu_key}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Add Submenu Button */}
                          <Dialog open={isAddSubmenuOpen} onOpenChange={setIsAddSubmenuOpen}>
                            <DialogTrigger asChild>
                              <Button size="sm" variant="outline" title="Adicionar submenu dentro deste menu">
                                <FolderPlus className="h-4 w-4 mr-1" />
                                Submenu
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                  <FolderPlus className="h-5 w-5" />
                                  Novo Submenu
                                </DialogTitle>
                                <DialogDescription>
                                  Criar um menu filho dentro de <strong>"{selectedMenu.title}"</strong>
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div className="p-3 rounded-lg bg-muted/50 border">
                                  <p className="text-sm">
                                    <span className="text-muted-foreground">Menu pai:</span>{" "}
                                    <Badge variant="secondary">{selectedMenu.title}</Badge>
                                  </p>
                                </div>
                                <div>
                                  <Label>Chave do Submenu *</Label>
                                  <Input
                                    placeholder="ex: plano_basico"
                                    value={newSubmenu.menu_key}
                                    onChange={(e) => setNewSubmenu({ ...newSubmenu, menu_key: e.target.value })}
                                  />
                                  <p className="text-xs text-muted-foreground mt-1">Identificador único, sem espaços</p>
                                </div>
                                <div>
                                  <Label>Título *</Label>
                                  <Input
                                    placeholder="ex: Plano Básico"
                                    value={newSubmenu.title}
                                    onChange={(e) => setNewSubmenu({ ...newSubmenu, title: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <Label>Mensagem *</Label>
                                  <Textarea
                                    placeholder="Texto que será enviado quando este submenu for acessado"
                                    value={newSubmenu.message_text}
                                    onChange={(e) => setNewSubmenu({ ...newSubmenu, message_text: e.target.value })}
                                    rows={5}
                                  />
                                  <p className="text-xs text-muted-foreground mt-1">Use {"{empresa}"}, {"{pix}"}, etc para variáveis</p>
                                </div>
                              </div>
                              <DialogFooter>
                                <Button variant="outline" onClick={() => setIsAddSubmenuOpen(false)}>Cancelar</Button>
                                <Button onClick={handleAddSubmenu}>
                                  <FolderPlus className="h-4 w-4 mr-1" />
                                  Criar Submenu
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                          
                          {selectedMenu.menu_key !== "main" && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                const childCount = menus.filter(m => m.parent_menu_key === selectedMenu.menu_key).length;
                                if (childCount > 0) {
                                  toast.error(`Este menu possui ${childCount} submenu(s). Remova-os primeiro.`);
                                  return;
                                }
                                deleteMenu(selectedMenu.id);
                                setSelectedMenuId(null);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </CardTitle>
                      <CardDescription>
                        Chave: {selectedMenu.menu_key}
                        {menus.filter(m => m.parent_menu_key === selectedMenu.menu_key).length > 0 && (
                          <span className="ml-2">
                            • {menus.filter(m => m.parent_menu_key === selectedMenu.menu_key).length} submenu(s)
                          </span>
                        )}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <Label>Mensagem do Menu</Label>
                        <Textarea
                          value={selectedMenu.message_text}
                          onChange={(e) => updateMenu(selectedMenu.id, { message_text: e.target.value })}
                          rows={5}
                        />
                      </div>
                      
                      {/* Show child menus if any */}
                      {menus.filter(m => m.parent_menu_key === selectedMenu.menu_key).length > 0 && (
                        <div className="p-3 rounded-lg bg-muted/30 border">
                          <Label className="text-sm mb-2 flex items-center gap-2">
                            <FolderTree className="h-4 w-4" />
                            Submenus dentro de "{selectedMenu.title}"
                          </Label>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {menus.filter(m => m.parent_menu_key === selectedMenu.menu_key).map(child => (
                              <Badge
                                key={child.id}
                                variant="secondary"
                                className="cursor-pointer hover:bg-secondary/80"
                                onClick={() => setSelectedMenuId(child.id)}
                              >
                                {child.title} →
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="border-t pt-4">
                        <div className="flex items-center justify-between mb-3">
                          <Label className="text-base">Opções do Menu</Label>
                          <Dialog open={isAddOptionOpen} onOpenChange={(open) => {
                            setIsAddOptionOpen(open);
                            if (open) {
                              // Reset form with correct next option number
                              setNewOption({
                                option_number: menuOptionsForSelected.length + 1,
                                option_text: "",
                                keywords: "",
                                target_menu_key: "__none__",
                                action_type: "menu",
                                action_response: "",
                              });
                            }
                          }}>
                            <DialogTrigger asChild>
                              <Button size="sm" variant="outline">
                                <Plus className="h-4 w-4 mr-1" /> Adicionar Opção
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Nova Opção</DialogTitle>
                                <DialogDescription>Adicione uma opção ao menu {selectedMenu.title}</DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <Label>Número *</Label>
                                    <Input
                                      type="number"
                                      min={1}
                                      value={newOption.option_number}
                                      onChange={(e) => setNewOption({ ...newOption, option_number: parseInt(e.target.value) })}
                                    />
                                  </div>
                                  <div>
                                    <Label>Ação *</Label>
                                    <Select
                                      value={newOption.action_type}
                                      onValueChange={(v) => setNewOption({ ...newOption, action_type: v })}
                                    >
                                      <SelectTrigger>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="menu">Ir para Menu</SelectItem>
                                        <SelectItem value="message">Enviar Mensagem</SelectItem>
                                        <SelectItem value="human">Transferir para Humano</SelectItem>
                                        <SelectItem value="end">Encerrar Conversa</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                                <div>
                                  <Label>Texto da Opção *</Label>
                                  <Input
                                    placeholder="ex: Ver Planos"
                                    value={newOption.option_text}
                                    onChange={(e) => setNewOption({ ...newOption, option_text: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <Label>Keywords (separadas por vírgula)</Label>
                                  <Input
                                    placeholder="plano, planos, preço, valor"
                                    value={newOption.keywords}
                                    onChange={(e) => setNewOption({ ...newOption, keywords: e.target.value })}
                                  />
                                  <p className="text-xs text-muted-foreground mt-1">Palavras que ativam esta opção além do número</p>
                                </div>
                                {newOption.action_type === "menu" && (
                                  <div>
                                    <Label>Menu Destino *</Label>
                                    <Select
                                      value={newOption.target_menu_key}
                                      onValueChange={(v) => setNewOption({ ...newOption, target_menu_key: v })}
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="Selecione o menu" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="__none__">-- Selecione --</SelectItem>
                                        {menus.map(m => (
                                          <SelectItem key={m.id} value={m.menu_key}>{m.title}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                )}
                                {(newOption.action_type === "message" || newOption.action_type === "human" || newOption.action_type === "end") && (
                                  <div>
                                    <Label>Resposta</Label>
                                    <Textarea
                                      placeholder="Mensagem que será enviada"
                                      value={newOption.action_response}
                                      onChange={(e) => setNewOption({ ...newOption, action_response: e.target.value })}
                                      rows={3}
                                    />
                                  </div>
                                )}
                              </div>
                              <DialogFooter>
                                <Button variant="outline" onClick={() => setIsAddOptionOpen(false)}>Cancelar</Button>
                                <Button onClick={handleAddOption}>Adicionar</Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </div>

                        <div className="space-y-2">
                          {menuOptionsForSelected.map(opt => (
                            <div key={opt.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                              <Badge variant="outline" className="w-8 h-8 flex items-center justify-center">
                                {opt.option_number}
                              </Badge>
                              <div className="flex-1">
                                <p className="font-medium">{opt.option_text}</p>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span className="capitalize">{opt.action_type}</span>
                                  {opt.target_menu_key && (
                                    <>
                                      <ChevronRight className="h-3 w-3" />
                                      <span>{opt.target_menu_key}</span>
                                    </>
                                  )}
                                  {opt.keywords?.length > 0 && (
                                    <span className="text-primary">+{opt.keywords.length} keywords</span>
                                  )}
                                </div>
                              </div>
                              <Switch
                                checked={opt.is_active}
                                onCheckedChange={(checked) => updateOption(opt.id, { is_active: checked })}
                              />
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => deleteOption(opt.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          ))}
                          {menuOptionsForSelected.length === 0 && (
                            <p className="text-center text-muted-foreground py-4">
                              Nenhuma opção configurada
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </>
                ) : (
                  <CardContent className="flex items-center justify-center h-64 text-muted-foreground">
                    <p>Selecione um menu para editar</p>
                  </CardContent>
                )}
              </Card>
            </div>
          </TabsContent>

          {/* TRIGGERS TAB */}
          <TabsContent value="triggers" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Gatilhos Globais</CardTitle>
                <CardDescription>Comandos que funcionam em qualquer ponto da conversa</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {triggers.map(trigger => (
                  <div key={trigger.id} className="flex items-start gap-4 p-4 rounded-lg border">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge>{trigger.trigger_name}</Badge>
                        <Badge variant="outline">{trigger.action_type}</Badge>
                        {trigger.target_menu_key && (
                          <Badge variant="secondary">→ {trigger.target_menu_key}</Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {trigger.keywords.map((kw, i) => (
                          <span key={i} className="px-2 py-1 text-xs bg-muted rounded">{kw}</span>
                        ))}
                      </div>
                    </div>
                    <Switch
                      checked={trigger.is_active}
                      onCheckedChange={(checked) => updateTrigger(trigger.id, { is_active: checked })}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* VARIABLES TAB */}
          <TabsContent value="variables" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Variáveis Personalizáveis</CardTitle>
                <CardDescription>Use {"{variavel}"} nos textos para substituição automática</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {variables.map(variable => (
                  <div key={variable.id} className="flex items-center gap-4">
                    <div className="w-32">
                      <Badge variant="outline" className="font-mono">
                        {"{" + variable.variable_key + "}"}
                      </Badge>
                    </div>
                    <Input
                      className="flex-1"
                      placeholder={variable.description || "Digite o valor"}
                      value={variable.variable_value}
                      onChange={(e) => updateVariable(variable.id, e.target.value)}
                    />
                    {variable.is_system && <Badge variant="secondary">Sistema</Badge>}
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* SETTINGS TAB */}
          <TabsContent value="settings" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Configurações Gerais</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label>Chatbot Ativo</Label>
                      <Switch
                        checked={config?.is_enabled ?? true}
                        onCheckedChange={(checked) => updateConfig({ is_enabled: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>Mostrar Digitando</Label>
                      <Switch
                        checked={config?.typing_enabled ?? true}
                        onCheckedChange={(checked) => updateConfig({ typing_enabled: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>Ignorar Grupos</Label>
                      <Switch
                        checked={config?.ignore_groups ?? true}
                        onCheckedChange={(checked) => updateConfig({ ignore_groups: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg border border-primary/20 bg-primary/5">
                      <div>
                        <Label className="text-base font-medium">List Message (WhatsApp)</Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          Envia menus como lista interativa profissional
                        </p>
                      </div>
                      <Switch
                        checked={config?.use_list_message ?? true}
                        onCheckedChange={(checked) => updateConfig({ use_list_message: checked })}
                      />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <Label>Delay Mínimo (segundos)</Label>
                      <Input
                        type="number"
                        min={1}
                        max={30}
                        value={config?.response_delay_min ?? 2}
                        onChange={(e) => updateConfig({ response_delay_min: parseInt(e.target.value) })}
                      />
                    </div>
                    <div>
                      <Label>Delay Máximo (segundos)</Label>
                      <Input
                        type="number"
                        min={1}
                        max={30}
                        value={config?.response_delay_max ?? 5}
                        onChange={(e) => updateConfig({ response_delay_max: parseInt(e.target.value) })}
                      />
                    </div>
                    <div>
                      <Label>Texto do Botão (List Message)</Label>
                      <Input
                        placeholder="📋 Ver opções"
                        value={config?.list_button_text ?? "📋 Ver opções"}
                        onChange={(e) => updateConfig({ list_button_text: e.target.value })}
                        disabled={!config?.use_list_message}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Texto exibido no botão de abrir a lista
                      </p>
                    </div>
                  </div>
                </div>
                <div>
                  <Label>Mensagem de Fallback</Label>
                  <Textarea
                    value={config?.fallback_message ?? ""}
                    onChange={(e) => updateConfig({ fallback_message: e.target.value })}
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Enviada quando o bot não entende a mensagem do usuário
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* SIMULATOR TAB */}
          <TabsContent value="simulator" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PlayCircle className="h-5 w-5" />
                  Simulador de Conversa
                </CardTitle>
                <CardDescription>Teste seu chatbot antes de usar</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg h-96 flex flex-col">
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {simulatorHistory.length === 0 && (
                      <p className="text-center text-muted-foreground py-8">
                        Digite uma mensagem para começar
                      </p>
                    )}
                    {simulatorHistory.map((msg, i) => (
                      <div
                        key={i}
                        className={`flex ${msg.from === "user" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg p-3 ${
                            msg.from === "user"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted"
                          }`}
                        >
                          <pre className="whitespace-pre-wrap font-sans text-sm">{msg.text}</pre>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="border-t p-3 flex gap-2">
                    <Input
                      placeholder="Digite sua mensagem..."
                      value={simulatorInput}
                      onChange={(e) => setSimulatorInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSimulatorSend()}
                    />
                    <Button onClick={handleSimulatorSend}>Enviar</Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSimulatorHistory([]);
                        setSimulatorMenuKey("main");
                      }}
                    >
                      Limpar
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Menu atual: <Badge variant="outline">{simulatorMenuKey}</Badge>
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
  );
}
