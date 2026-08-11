import { useEffect, useRef } from "react";
import { syncBlocksFromRemote } from "@/lib/blocks";
import { supabase } from "@/integrations/supabase/client";
import { BLOCKS_TABLE } from "@/lib/blocks-remote";

const POLL_INTERVAL_MS = 12_000;

/**
 * Mantiene la caché local al día con el backend compartido: se suscribe en
 * vivo a los cambios de la tabla de bloques (otro dispositivo escanea, alguien
 * renombra o borra un bloque) y, como red de seguridad si la conexión en vivo
 * se cae, hace polling cada ~12s. Se salta el tick con la pestaña oculta para
 * no gastar batería/datos en segundo plano.
 */
export function usePollRemoteSync(onChanged: () => void): void {
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  useEffect(() => {
    const pull = () => {
      void syncBlocksFromRemote().then((changed) => {
        if (changed) onChangedRef.current();
      });
    };

    const channel = supabase
      .channel("rutas-bloques-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: BLOCKS_TABLE }, pull)
      .subscribe();

    const id = setInterval(() => {
      if (document.hidden) return;
      pull();
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(id);
      void supabase.removeChannel(channel);
    };
  }, []);
}
