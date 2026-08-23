import type { Evidence, Report, ServiceLine, StoredFile } from '../types';

export const uid = () => `r_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
export const today = () => new Date().toISOString().slice(0, 10);

export function blankService(): ServiceLine {
  return { id: uid(), tipo: '', preco: '', unid: '', qtde: '', precoUnit: '' };
}

export function blankEvidence(): Evidence {
  return { id: uid(), os: '', servicos: [blankService()], observacao: '', fotos: [] };
}

export function newReport(): Report {
  const now = new Date().toISOString();
  return {
    version: 11,
    id: uid(),
    createdAt: now,
    updatedAt: now,
    generatedAt: null,
    archivedAt: null,
    responsavel: { elaboradoPor: '', data: today(), cargo: '', empresa: '' },
    obra: { municipio: '', endereco: '', tipoObra: '', aguaEsgoto: '' },
    evidencias: [blankEvidence()],
    anexos: [],
  };
}

// Faz a leitura segura de relatórios antigos. A ideia é não quebrar a tela só porque
// um JSON antigo não possui um campo que passou a existir em versões mais novas.
export function normalizeReport(input: Partial<Report> | any): Report {
  const base = newReport();
  const r: Report = {
    ...base,
    ...input,
    version: 11,
    id: input?.id || uid(),
    responsavel: { ...base.responsavel, ...(input?.responsavel || {}) },
    obra: { ...base.obra, ...(input?.obra || {}) },
    anexos: Array.isArray(input?.anexos) ? input.anexos.map(normalizeFile) : [],
    evidencias: [],
  };

  const oldEvidences = Array.isArray(input?.evidencias) && input.evidencias.length ? input.evidencias : [blankEvidence()];
  r.evidencias = oldEvidences.map((e: any) => {
    let services: ServiceLine[];
    if (Array.isArray(e?.servicos) && e.servicos.length) {
      services = e.servicos.map((s: any) => ({ ...blankService(), ...s, id: s?.id || uid() }));
    } else {
      // Conversão da estrutura antiga: tipo/unidade/quantidade viram uma linha de serviço.
      services = [{
        ...blankService(),
        tipo: e?.tipo || '',
        unid: e?.unidade || '',
        qtde: e?.quantidade ?? '',
      }];
    }
    return {
      id: e?.id || uid(),
      os: String(e?.os ?? ''),
      servicos: services,
      observacao: e?.observacao || '',
      fotos: Array.isArray(e?.fotos) ? e.fotos.map(normalizeFile) : [],
    };
  });
  return r;
}

function normalizeFile(f: any): StoredFile {
  return {
    id: f?.id || uid(),
    name: f?.name || 'arquivo',
    type: f?.type || 'application/octet-stream',
    data: f?.data || '',
    descricao: f?.descricao || '',
  };
}

export function normalizeText(value: unknown) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function moneyBR(value: number | string) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function numberBR(value: number | string) {
  return Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

export function fileNameBase(r: Report, when = new Date()) {
  const date = when.toLocaleDateString('pt-BR').replaceAll('/', '-');
  const safe = (s: string) => (s || 'NÃO INFORMADO').replace(/[\\/:*?"<>|]+/g, '-').trim();
  return `${safe(r.obra.tipoObra)} - ${safe(r.obra.aguaEsgoto)} - ${safe(r.obra.endereco)} - ${safe(r.obra.municipio)} - ${date}`;
}

export async function fileToStored(file: File): Promise<StoredFile> {
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  return { id: uid(), name: file.name, type: file.type, data, descricao: '' };
}

export function dataUrlToUint8(dataUrl: string): Uint8Array {
  const b64 = dataUrl.split(',')[1] || '';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Retira o conteúdo pesado das fotos/anexos antes de montar o índice de pesquisa.
// Assim, a busca não fica lenta tentando pesquisar dentro de Base64.
export function searchableText(report: Report) {
  const copy = JSON.parse(JSON.stringify(report, (key, value) => {
    if (key === 'data' && typeof value === 'string' && value.startsWith('data:')) return '';
    return value;
  }));
  return normalizeText(JSON.stringify(copy));
}

export function deepClone<T>(obj: T): T {
  return typeof structuredClone === 'function' ? structuredClone(obj) : JSON.parse(JSON.stringify(obj));
}
