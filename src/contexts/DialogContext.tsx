import * as React from "react";

/**
 * Context to signal that we're inside a Dialog/Modal.
 * Components like Select can use this to avoid portal conflicts.
 */
const DialogContext = React.createContext(false);

export function useIsInsideDialog() {
  return React.useContext(DialogContext);
}

export function DialogContextProvider({ children }: { children: React.ReactNode }) {
  return (
    <DialogContext.Provider value={true}>
      {children}
    </DialogContext.Provider>
  );
}
