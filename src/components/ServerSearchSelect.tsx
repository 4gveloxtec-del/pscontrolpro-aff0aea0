/**
 * ServerSearchSelect - Componente de busca e seleção de servidor
 * 
 * Substitui o dropdown tradicional por um campo de busca que filtra
 * servidores por nome ou primeira letra.
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Server, X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ServerOption {
  id: string;
  name: string;
  icon_url?: string | null;
  is_credit_based?: boolean;
  is_active?: boolean;
}

interface ServerSearchSelectProps {
  servers: ServerOption[];
  value: string;
  onValueChange: (serverId: string, serverName: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function ServerSearchSelect({
  servers,
  value,
  onValueChange,
  placeholder = "Buscar servidor por nome...",
  disabled = false,
}: ServerSearchSelectProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Servidor selecionado atual
  const selectedServer = useMemo(() => {
    return servers.find(s => s.id === value);
  }, [servers, value]);

  // Filtrar servidores pela busca
  const filteredServers = useMemo(() => {
    if (!searchTerm.trim()) {
      return servers;
    }
    
    const term = searchTerm.toLowerCase().trim();
    
    return servers.filter(server => {
      const name = server.name.toLowerCase();
      // Busca por nome completo ou primeira letra
      return name.includes(term) || name.startsWith(term);
    });
  }, [servers, searchTerm]);

  // Fechar ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Selecionar servidor
  const handleSelect = (server: ServerOption) => {
    onValueChange(server.id, server.name);
    setSearchTerm('');
    setIsOpen(false);
  };

  // Limpar seleção
  const handleClear = () => {
    onValueChange('', '');
    setSearchTerm('');
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Campo de busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          type="text"
          value={isOpen ? searchTerm : (selectedServer?.name || searchTerm)}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            setIsOpen(true);
            if (selectedServer) {
              setSearchTerm('');
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          className="pl-9 pr-9"
        />
        {(value || searchTerm) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
            onClick={handleClear}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Lista de resultados */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
          <ScrollArea className="max-h-[200px]">
            {filteredServers.length === 0 ? (
              <div className="p-3 text-center text-sm text-muted-foreground">
                {searchTerm ? (
                  <>Nenhum servidor encontrado para "{searchTerm}"</>
                ) : (
                  <>Nenhum servidor disponível</>
                )}
              </div>
            ) : (
              <div className="p-1">
                {filteredServers.map((server) => (
                  <button
                    key={server.id}
                    type="button"
                    onClick={() => handleSelect(server)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors",
                      "hover:bg-accent hover:text-accent-foreground",
                      value === server.id && "bg-accent/50"
                    )}
                  >
                    {server.icon_url ? (
                      <img 
                        src={server.icon_url} 
                        alt="" 
                        className="h-5 w-5 rounded flex-shrink-0"
                      />
                    ) : (
                      <Server className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    )}
                    <span className="truncate flex-1 text-left">{server.name}</span>
                    {server.is_credit_based && (
                      <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-primary/10">
                        Créd
                      </span>
                    )}
                    {value === server.id && (
                      <Check className="h-4 w-4 text-primary flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
