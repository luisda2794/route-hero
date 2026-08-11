CREATE TABLE public.rutas_bloques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  datos jsonb NOT NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rutas_bloques TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rutas_bloques TO authenticated;
GRANT ALL ON public.rutas_bloques TO service_role;

ALTER TABLE public.rutas_bloques ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acceso abierto a bloques" ON public.rutas_bloques
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.rutas_bloques;