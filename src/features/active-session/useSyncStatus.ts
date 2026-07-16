"use client";

import { useEffect, useState } from "react";

import { getSyncEngine, type SyncStatus } from "./sync";

/** Suscribe el componente al estado observable del motor de sync. */
export function useSyncStatus(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>(() =>
    getSyncEngine().getStatus(),
  );
  useEffect(() => {
    return getSyncEngine().subscribe(setStatus);
  }, []);
  return status;
}
