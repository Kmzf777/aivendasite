// Barramento de eventos em memoria. A extensao publica em /api/evento e as
// telas escutam em /api/eventos por SSE.
//
// Guardado no globalThis de proposito: em dev o Next recarrega os modulos a
// cada edicao, e um Set em escopo de modulo perderia os ouvintes conectados.
type Ouvinte = (ev: unknown) => void;
const g = globalThis as unknown as { __ouvintes?: Set<Ouvinte> };
if (!g.__ouvintes) g.__ouvintes = new Set();

export function assinar(fn: Ouvinte) {
  g.__ouvintes!.add(fn);
  return () => { g.__ouvintes!.delete(fn); };
}
export function publicar(ev: unknown) {
  for (const fn of g.__ouvintes!) { try { fn(ev); } catch {} }
}
export function quantos() { return g.__ouvintes!.size; }
