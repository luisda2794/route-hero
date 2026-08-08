/**
 * Public Supabase project config for the RutaFacil "sesiones" backend — used
 * to persist a confirmed zone assignment remotely (so /consulta can look up
 * a package from any device) alongside the existing localStorage save.
 *
 * The anon key below is meant to be public (it's what every Supabase project
 * ships in its client bundle); it only grants what the deployed edge
 * functions and RLS policies allow — direct table access is denied by RLS,
 * so this key alone cannot read or list package data.
 */
export const SUPABASE_URL = "https://qdrmaddvontnzxvourug.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkcm1hZGR2b250bnp4dm91cnVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyMTE2ODIsImV4cCI6MjEwMTc4NzY4Mn0.iuoocEZWQRKfx71ARYTYAS0qpOPQk9jLx6T9it_RR9g";

export function functionUrl(name: string): string {
  return `${SUPABASE_URL}/functions/v1/${name}`;
}
