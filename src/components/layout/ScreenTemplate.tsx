/**
 * ScreenTemplate - Mandatory base template for all screens
 * Enforces architectural patterns: navigation, scroll, focus, error handling
 */

import React, { useEffect, useRef, useId, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useNavigationSafe } from '@/contexts/NavigationContext';
import { useScrollSafe } from '@/contexts/ScrollContext';
import { debugLog, debugWarn } from '@/lib/debug/navigationDebug';
import { validateScreenContext } from '@/lib/guardrails/stateValidator';
import { cn } from '@/lib/utils';

export interface ScreenTemplateProps {
  /**
   * Unique screen identifier (auto-generated if not provided)
   */
  screenId?: string;
  
  /**
   * Screen content
   */
  children: React.ReactNode;
  
  /**
   * Additional CSS classes for the container
   */
  className?: string;
  
  /**
   * Whether to enable scroll restoration for this screen
   * @default true
   */
  enableScrollRestoration?: boolean;
  
  /**
   * Whether to log screen lifecycle events in dev mode
   * @default true
   */
  enableDebugLogging?: boolean;
  
  /**
   * Callback when screen becomes active
   */
  onActivate?: () => void;
  
  /**
   * Callback when screen becomes inactive
   */
  onDeactivate?: () => void;
}

/**
 * Context for screen-level state
 */
interface ScreenContextValue {
  screenId: string;
  isActive: boolean;
  containerRef: React.RefObject<HTMLDivElement>;
}

const ScreenContext = React.createContext<ScreenContextValue | null>(null);

/**
 * Hook to access current screen context
 */
export function useScreenContext(): ScreenContextValue | null {
  return React.useContext(ScreenContext);
}

/**
 * ScreenTemplate Component
 * All application screens should use this template to ensure consistency
 */
export function ScreenTemplate({
  screenId: providedScreenId,
  children,
  className,
  enableScrollRestoration = true,
  enableDebugLogging = true,
  onActivate,
  onDeactivate,
}: ScreenTemplateProps) {
  const generatedId = useId();
  const screenId = providedScreenId || `screen-${generatedId}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigation = useNavigationSafe();
  const scrollContext = useScrollSafe();
  const isActiveRef = useRef(true);
  const mountedRef = useRef(false);

  // Validate screen context on mount
  useEffect(() => {
    const validation = validateScreenContext(screenId, containerRef);
    
    if (!validation.isValid && enableDebugLogging) {
      debugWarn('guardrail', 'Screen context validation failed', {
        screenId,
        issues: validation.issues,
      });
    }
  }, [screenId, enableDebugLogging]);

  // Log screen lifecycle
  useEffect(() => {
    if (!enableDebugLogging) return;

    if (!mountedRef.current) {
      debugLog('navigation', `Screen mounted: ${screenId}`, {
        path: location.pathname,
        search: location.search,
      });
      mountedRef.current = true;
    }

    return () => {
      debugLog('navigation', `Screen unmounted: ${screenId}`);
    };
  }, [screenId, location.pathname, location.search, enableDebugLogging]);

  // Handle activation/deactivation
  useEffect(() => {
    const wasActive = isActiveRef.current;
    const isNowActive = navigation?.screenStack[navigation.screenStack.length - 1]?.path === location.pathname;
    
    if (wasActive !== isNowActive) {
      isActiveRef.current = isNowActive;
      
      if (isNowActive) {
        if (enableDebugLogging) {
          debugLog('navigation', `Screen activated: ${screenId}`);
        }
        onActivate?.();
      } else {
        if (enableDebugLogging) {
          debugLog('navigation', `Screen deactivated: ${screenId}`);
        }
        onDeactivate?.();
      }
    }
  }, [navigation?.screenStack, location.pathname, screenId, onActivate, onDeactivate, enableDebugLogging]);

  // Scroll restoration
  useEffect(() => {
    if (!enableScrollRestoration || !scrollContext) return;

    const routeKey = `${location.pathname}${location.search}`;
    
    // Attempt to restore scroll position
    const restoreScroll = () => {
      scrollContext.restoreScrollPosition(routeKey);
    };

    // Use requestIdleCallback for non-blocking restoration
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(restoreScroll, { timeout: 100 });
    } else {
      setTimeout(restoreScroll, 50);
    }
  }, [location.pathname, location.search, enableScrollRestoration, scrollContext]);

  // Save scroll position on unmount or route change
  useEffect(() => {
    if (!enableScrollRestoration || !scrollContext) return;

    return () => {
      const routeKey = `${location.pathname}${location.search}`;
      scrollContext.saveScrollPosition(routeKey);
    };
  }, [location.pathname, location.search, enableScrollRestoration, scrollContext]);

  // Context value
  const contextValue: ScreenContextValue = {
    screenId,
    isActive: isActiveRef.current,
    containerRef: containerRef as React.RefObject<HTMLDivElement>,
  };

  return (
    <ScreenContext.Provider value={contextValue}>
      <div
        ref={containerRef}
        className={cn('screen-container', className)}
        data-screen-id={screenId}
        data-route={location.pathname}
      >
        {children}
      </div>
    </ScreenContext.Provider>
  );
}

/**
 * Higher-order component to wrap a page with ScreenTemplate
 */
export function withScreenTemplate<P extends object>(
  Component: React.ComponentType<P>,
  templateProps?: Omit<ScreenTemplateProps, 'children'>
) {
  const WrappedComponent = (props: P) => (
    <ScreenTemplate {...templateProps}>
      <Component {...props} />
    </ScreenTemplate>
  );

  WrappedComponent.displayName = `withScreenTemplate(${Component.displayName || Component.name || 'Component'})`;
  
  return WrappedComponent;
}

/**
 * Hook for screen-level actions
 */
export function useScreenActions() {
  const screen = useScreenContext();
  const scrollContext = useScrollSafe();
  const location = useLocation();

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    debugLog('scroll', 'Scrolled to top', { screenId: screen?.screenId });
  }, [screen?.screenId]);

  const scrollToElement = useCallback((elementId: string) => {
    const element = document.querySelector(`[data-item-id="${elementId}"]`);
    if (element) {
      element.scrollIntoView({ behavior: 'instant', block: 'center' });
      debugLog('scroll', 'Scrolled to element', { screenId: screen?.screenId, elementId });
    }
  }, [screen?.screenId]);

  const savePosition = useCallback((itemId?: string) => {
    if (scrollContext) {
      const routeKey = `${location.pathname}${location.search}`;
      scrollContext.saveScrollPosition(routeKey, itemId);
    }
  }, [scrollContext, location.pathname, location.search]);

  return {
    screenId: screen?.screenId,
    isActive: screen?.isActive ?? true,
    containerRef: screen?.containerRef,
    scrollToTop,
    scrollToElement,
    savePosition,
  };
}

export default ScreenTemplate;
