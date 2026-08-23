// Tipos centrais do sistema. Eles funcionam como um "mapa" dos dados do relatório.
// Com TypeScript, se um campo for usado com formato errado, o editor consegue avisar antes de executar.

export type PriceItem = {
  descricao: string;
  preco: number;
  unid: string;
  precoUnit: number;
};

export type ServiceLine = {
  id: string;
  tipo: string;
  preco: string;
  unid: string;
  qtde: string;
  precoUnit: string;
};

export type StoredFile = {
  id: string;
  name: string;
  type: string;
  data: string; // arquivo convertido em Data URL para poder ser salvo localmente/JSON
  descricao: string;
};

export type Evidence = {
  id: string;
  os: string;
  servicos: ServiceLine[];
  observacao: string;
  fotos: StoredFile[];
};

export type Report = {
  version: number;
  id: string;
  createdAt: string;
  updatedAt: string;
  generatedAt: string | null;
  archivedAt: string | null;
  responsavel: {
    elaboradoPor: string;
    data: string;
    cargo: string;
    empresa: string;
  };
  obra: {
    municipio: string;
    endereco: string;
    tipoObra: string;
    aguaEsgoto: string;
  };
  evidencias: Evidence[];
  anexos: StoredFile[];
};
