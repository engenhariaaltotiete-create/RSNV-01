import { useCallback, useEffect, useRef, useState } from 'react';
import type { GeneratedPdf } from './lib/pdf';
import type { Report } from './types';
import { Dashboard } from './components/Dashboard';
import { Editor } from './components/Editor';
import { reportStorage } from './lib/storage';
import { fileNameBase, newReport, normalizeReport } from './lib/helpers';
import { generatePdf } from './lib/pdf';
import logo from './assets/sabesp-logo.jpg';
import './styles/app.css';

type Screen = 'dashboard' | 'editor';

function validateReport(report: Report): string[] {
  const errors: string[] = [];
  if (!report.responsavel.elaboradoPor.trim()) errors.push('Elaborado por');
  if (!report.responsavel.data) errors.push('Data');
  if (!report.responsavel.cargo.trim()) errors.push('Cargo/Função');
  if (!report.responsavel.empresa.trim()) errors.push('Empresa');
  if (!report.obra.municipio.trim()) errors.push('Município');
  if (!report.obra.endereco.trim()) errors.push('Endereço');
  if (!report.obra.tipoObra.trim()) errors.push('Tipo de Serviço da obra');
  if (!report.obra.aguaEsgoto.trim()) errors.push('Água/Esgoto');
  report.evidencias.forEach((ev, i) => {
    if (!ev.os.trim()) errors.push(`OS da Evidência ${i + 1}`);
    if (!ev.fotos.length) errors.push(`Ao menos uma foto na Evidência ${i + 1}`);
    ev.servicos.forEach((s, j) => {
      if (!s.tipo.trim()) errors.push(`Tipo de Serviço da Evidência ${i + 1}, linha ${j + 1}`);
      if (!s.qtde || Number(s.qtde) <= 0) errors.push(`Quantidade da Evidência ${i + 1}, linha ${j + 1}`);
    });
  });
  return errors;
}

function downloadBlob(blob: Blob, fileName: string) {
  // Cria um link temporário e simula o clique. Essa abordagem funciona melhor em Android
  // do que depender de pop-up ou da tela de impressão do navegador.
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [reports, setReports] = useState<Report[]>([]);
  const [current, setCurrent] = useState<Report | null>(null);
  const [busyPdf, setBusyPdf] = useState(false);
  const [pdfResult, setPdfResult] = useState<GeneratedPdf | null>(null);
  const [message, setMessage] = useState('Carregando armazenamento local...');
  const saveTimer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    const all = await reportStorage.all();
    setReports(all.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
    setMessage('Armazenamento local ativo');
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // Salvamento automático com pequeno atraso: evita gravar o banco a cada tecla digitada.
  useEffect(() => {
    if (!current || screen !== 'editor') return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void reportStorage.put(current).then(() => setMessage('Salvo automaticamente'));
    }, 700);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
  }, [current, screen]);

  const openReport = async (id: string) => {
    // A tela é trocada apenas depois de obter os dados. Não existe mais alert genérico no meio da montagem.
    const found = await reportStorage.get(id);
    if (!found) return setMessage('Relatório não encontrado.');
    setCurrent(normalizeReport(found));
    setScreen('editor');
  };

  const createNew = () => {
    setCurrent(newReport());
    setScreen('editor');
  };

  const saveAndBack = async () => {
    if (current) await reportStorage.put(current);
    await refresh();
    setScreen('dashboard');
  };

  const exportJson = (report: Report) => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' });
    downloadBlob(blob, `${fileNameBase(report)}.json`);
  };

  const importJson = async (file: File) => {
    try {
      const raw = await file.text();
      const report = normalizeReport(JSON.parse(raw));
      await reportStorage.put(report);
      await refresh();
      setMessage('JSON importado com sucesso.');
    } catch (error) {
      console.error(error);
      setMessage('O arquivo JSON não pôde ser importado.');
    }
  };

  const generate = async (report: Report) => {
    const errors = validateReport(report);
    if (errors.length) {
      setMessage(`Preencha os campos obrigatórios: ${errors.slice(0, 4).join(', ')}${errors.length > 4 ? '...' : ''}`);
      return;
    }
    setBusyPdf(true);
    setMessage('Gerando PDF diretamente no dispositivo...');
    try {
      const stamped = { ...report, generatedAt: new Date().toISOString() };
      await reportStorage.put(stamped);
      if (current?.id === stamped.id) setCurrent(stamped);
      const result = await generatePdf(stamped);
      setPdfResult((old) => { if (old) URL.revokeObjectURL(old.url); return result; });
      setMessage('PDF gerado. Use Baixar ou Compartilhar.');
      await refresh();
    } catch (error) {
      console.error('Erro detalhado ao gerar PDF:', error);
      setMessage('Não foi possível gerar o PDF. Veja o console do navegador para o erro técnico.');
    } finally {
      setBusyPdf(false);
    }
  };

  const sharePdf = async () => {
    if (!pdfResult) return;
    try {
      const file = new File([pdfResult.blob], pdfResult.fileName, { type: 'application/pdf' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: pdfResult.fileName });
      } else {
        downloadBlob(pdfResult.blob, pdfResult.fileName);
      }
    } catch (error) {
      // Cancelar a tela de compartilhamento não é uma falha grave.
      console.warn('Compartilhamento cancelado/indisponível', error);
    }
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-inner">
          <div className="brand"><img src={logo} alt="Logo" /><div><h1>Relatórios de Serviços Não Vinculados</h1><small>Controle local de relatórios</small></div></div>
          <div className="storage-status">{message}</div>
        </div>
      </header>

      {screen === 'dashboard' ? (
        <Dashboard
          reports={reports}
          onNew={createNew}
          onOpen={(id) => { void openReport(id); }}
          onArchive={(id, archive) => { void reportStorage.get(id).then(async (r) => { if (!r) return; r.archivedAt = archive ? new Date().toISOString() : null; await reportStorage.put(r); await refresh(); }); }}
          onDelete={(id) => { if (window.confirm('Excluir este relatório do armazenamento local?')) void reportStorage.remove(id).then(refresh); }}
          onExport={(id) => { const r = reports.find((x) => x.id === id); if (r) exportJson(r); }}
          onPdf={(id) => { const r = reports.find((x) => x.id === id); if (r) void generate(r); }}
          onImport={(file) => { void importJson(file); }}
        />
      ) : current ? (
        <Editor
          report={current}
          onChange={setCurrent}
          onSaveBack={() => { void saveAndBack(); }}
          onPdf={() => { void generate(current); }}
          onExport={() => exportJson(current)}
          busy={busyPdf}
        />
      ) : null}

      <footer className="developer-footer">Desenvolvido pelo Polo de Manutenção Suzano - OLMS<br />Eng° Eder Nunes.</footer>

      {pdfResult && (
        <div className="modal-backdrop" onClick={() => setPdfResult(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>PDF gerado</h3>
            <p>O arquivo foi criado diretamente no navegador. No celular, prefira “Baixar PDF” ou “Compartilhar”.</p>
            <div className="modal-actions">
              <button onClick={() => downloadBlob(pdfResult.blob, pdfResult.fileName)}>Baixar PDF</button>
              <button className="secondary" onClick={() => { void sharePdf(); }}>Compartilhar</button>
              <a className="button ghost" href={pdfResult.url} target="_blank" rel="noreferrer">Abrir</a>
              <button className="ghost" onClick={() => setPdfResult(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
