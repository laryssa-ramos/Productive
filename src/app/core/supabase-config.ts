/**
 * Preencha com os dados do seu projeto Supabase (Project Settings › API).
 *
 * A chave "anon" é pública por natureza — ela vai no bundle do navegador de
 * qualquer forma, e quem protege os dados é a Row Level Security configurada no
 * banco, não o segredo da chave. Pode versionar este arquivo sem medo.
 *
 * Enquanto estiver em branco, o app funciona exatamente como antes: só
 * localStorage, sem login e sem nuvem.
 */
export const SUPABASE_URL: string = 'https://bycnprorsunlnogtkbzi.supabase.co';
export const SUPABASE_ANON_KEY: string = 'sb_publishable_D7D3htQ8BMQmZt3ppfhQdg_1tJ1OXwQ';

/** Tabela criada pelo script em docs/supabase.sql. */
export const SYNC_TABLE = 'productive_state';

export const syncEnabled = (): boolean =>
  SUPABASE_URL.trim().length > 0 && SUPABASE_ANON_KEY.trim().length > 0;
