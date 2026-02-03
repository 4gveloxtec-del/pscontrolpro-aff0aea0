/**
 * DeviceSearchSelect - Componente de busca e seleção múltipla de dispositivos
 * 
 * Permite buscar e selecionar até 5 dispositivos com interface de busca.
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Search, X, Tv, Smartphone, Monitor, Tablet, Gamepad2, Laptop, Flame, Projector } from 'lucide-react';
import { cn } from '@/lib/utils';

const MAX_DEVICES = 5;

// Device options with icons
const DEVICE_OPTIONS = [
  { value: 'Smart TV', label: 'Smart TV', icon: Tv, emoji: '📺' },
  { value: 'TV Android', label: 'TV Android', icon: Tv, emoji: '📺' },
  { value: 'TV Box', label: 'TV Box', icon: Monitor, emoji: '📦' },
  { value: 'Fire Stick', label: 'Fire Stick', icon: Flame, emoji: '🔥' },
  { value: 'Celular', label: 'Celular', icon: Smartphone, emoji: '📱' },
  { value: 'Tablet', label: 'Tablet', icon: Tablet, emoji: '📲' },
  { value: 'PC', label: 'PC', icon: Monitor, emoji: '💻' },
  { value: 'Notebook', label: 'Notebook', icon: Laptop, emoji: '💻' },
  { value: 'Video Game', label: 'Video Game', icon: Gamepad2, emoji: '🎮' },
  { value: 'Projetor Android', label: 'Projetor Android', icon: Projector, emoji: '📽️' },
  { value: 'Chromecast', label: 'Chromecast', icon: Monitor, emoji: '📡' },
  { value: 'Apple TV', label: 'Apple TV', icon: Tv, emoji: '🍎' },
  { value: 'Roku', label: 'Roku', icon: Monitor, emoji: '📺' },
  { value: 'Outro', label: 'Outro', icon: Monitor, emoji: '🔌' },
];

interface DeviceSearchSelectProps {
  value: string; // Comma-separated list of devices
  onValueChange: (devices: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function DeviceSearchSelect({
  value,
  onValueChange,
  placeholder = "Buscar dispositivo...",
  disabled = false,
}: DeviceSearchSelectProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Parse selected devices from comma-separated string
  const selectedDevices = useMemo(() => {
    return value ? value.split(', ').filter(Boolean) : [];
  }, [value]);

  // Filter devices by search term
  const filteredDevices = useMemo(() => {
    if (!searchTerm.trim()) {
      return DEVICE_OPTIONS;
    }
    
    const term = searchTerm.toLowerCase().trim();
    
    return DEVICE_OPTIONS.filter(device => {
      const name = device.value.toLowerCase();
      return name.includes(term) || name.startsWith(term);
    });
  }, [searchTerm]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Toggle device selection
  const handleToggleDevice = (deviceValue: string) => {
    const isSelected = selectedDevices.includes(deviceValue);
    
    if (isSelected) {
      // Remove device
      const newDevices = selectedDevices.filter(d => d !== deviceValue);
      onValueChange(newDevices.join(', '));
    } else {
      // Add device (if under limit)
      if (selectedDevices.length < MAX_DEVICES) {
        const newDevices = [...selectedDevices, deviceValue];
        onValueChange(newDevices.join(', '));
      }
    }
  };

  // Remove a specific device
  const handleRemoveDevice = (deviceValue: string) => {
    const newDevices = selectedDevices.filter(d => d !== deviceValue);
    onValueChange(newDevices.join(', '));
  };

  // Clear all selections
  const handleClearAll = () => {
    onValueChange('');
    setSearchTerm('');
  };

  // Get device info by value
  const getDeviceInfo = (deviceValue: string) => {
    return DEVICE_OPTIONS.find(d => d.value === deviceValue);
  };

  return (
    <div ref={containerRef} className="relative w-full space-y-2">
      {/* Selected devices badges */}
      {selectedDevices.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedDevices.map((device) => {
            const deviceInfo = getDeviceInfo(device);
            return (
              <Badge
                key={device}
                variant="secondary"
                className="text-xs gap-1 pr-1"
              >
                {deviceInfo?.emoji || '📱'} {device}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 ml-1 hover:bg-destructive/20"
                  onClick={() => handleRemoveDevice(device)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            );
          })}
          {selectedDevices.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
              onClick={handleClearAll}
            >
              Limpar todos
            </Button>
          )}
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={
            selectedDevices.length >= MAX_DEVICES 
              ? `Máximo de ${MAX_DEVICES} dispositivos atingido`
              : placeholder
          }
          disabled={disabled || selectedDevices.length >= MAX_DEVICES}
          className="pl-9 pr-4"
        />
      </div>

      {/* Counter */}
      <div className="text-xs text-muted-foreground">
        {selectedDevices.length}/{MAX_DEVICES} dispositivos selecionados
      </div>

      {/* Dropdown list */}
      {isOpen && selectedDevices.length < MAX_DEVICES && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
          <ScrollArea className="max-h-[200px]">
            {filteredDevices.length === 0 ? (
              <div className="p-3 text-center text-sm text-muted-foreground">
                {searchTerm ? (
                  <>Nenhum dispositivo encontrado para "{searchTerm}"</>
                ) : (
                  <>Nenhum dispositivo disponível</>
                )}
              </div>
            ) : (
              <div className="p-1">
                {filteredDevices.map((device) => {
                  const isSelected = selectedDevices.includes(device.value);
                  const DeviceIcon = device.icon;
                  
                  return (
                    <label
                      key={device.value}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors cursor-pointer",
                        "hover:bg-accent hover:text-accent-foreground",
                        isSelected && "bg-accent/50"
                      )}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => handleToggleDevice(device.value)}
                        disabled={!isSelected && selectedDevices.length >= MAX_DEVICES}
                      />
                      <span className="text-lg">{device.emoji}</span>
                      <DeviceIcon className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1">{device.label}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

export { DEVICE_OPTIONS };
