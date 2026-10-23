import type { ExerciseDetail, ExerciseMedia } from './exercisesApi';

/**
 * O que mostrar na área de demonstração (UX-10, AC-10). A API só devolve mídia aprovada e publicada, mas o app nunca
 * depende dela: sem mídia utilizável, a tela mostra o texto das instruções no lugar, sem dar a impressão de erro.
 * - `image`: há uma imagem aprovada para mostrar;
 * - `video`: há vídeo/animação aprovado, mas o player ainda não existe neste app (E10-09): avisa e segue com o texto;
 * - `none`: não há mídia aprovada.
 */
export type Demo = { kind: 'image'; url: string; version: string } | { kind: 'video'; version: string } | { kind: 'none' };

export function demoOf(media: ExerciseMedia[] | undefined): Demo {
  const approved = (media ?? []).filter((item) => item.status === undefined || item.status === 'aprovado');
  const image = approved.find((item) => item.tipo === 'imagem' && item.url);
  if (image) {
    return { kind: 'image', url: image.url, version: image.versao };
  }
  const video = approved.find((item) => item.tipo !== 'imagem');
  return video ? { kind: 'video', version: video.versao } : { kind: 'none' };
}

/** Quebra o texto das instruções em passos: cada linha vira um passo, sem a numeração que já venha escrita. */
export function instructionSteps(text: string | null | undefined): string[] {
  return (text ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, '').trim())
    .filter((line) => line !== '');
}

/** Músculos separados em principais e secundários, na ordem recebida. */
export function musclesOf(detail: Pick<ExerciseDetail, 'musculos'>): { primary: string[]; secondary: string[] } {
  const list = detail.musculos ?? [];
  return {
    primary: list.filter((m) => m.papel === 'primario').map((m) => m.nome),
    secondary: list.filter((m) => m.papel === 'secundario').map((m) => m.nome),
  };
}
