import { jsPDF } from 'jspdf';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import UTIF from 'utif';
import type { Report, StoredFile } from '../types';
import { dataUrlToUint8, fileNameBase, moneyBR, numberBR } from './helpers';
import logoUrl from '../assets/sabesp-logo.jpg';

// Este arquivo concentra a geração do PDF.
// A mudança principal em relação às versões antigas é que NÃO usamos window.print().
// O PDF é criado como arquivo binário (Blob), o que é muito mais confiável no Android.

const BLUE = [7, 143, 190] as const;
const LINE_BLUE = [17, 166, 204] as const;
const DARK = [47, 59, 68] as const;
const PAGE_W = 210;
const PAGE_H = 297;
const M = 10;
const CONTENT_BOTTOM = 268;

let cachedLogo: string | null = null;
async function getLogoDataUrl() {
  if (cachedLogo) return cachedLogo;
  const blob = await fetch(logoUrl).then((r) => r.blob());
  cachedLogo = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
  return cachedLogo;
}

function addBaseHeader(doc: jsPDF, report: Report, logo: string) {
  // Logo à esquerda e título em uma única linha centralizada, conforme definido.
  doc.addImage(logo, 'JPEG', 12, 10, 17, 17, undefined, 'FAST');
  doc.setTextColor(...BLUE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('RELATÓRIO DE SERVIÇOS NÃO VINCULADOS A OS', PAGE_W / 2, 18, { align: 'center' });

  doc.setFontSize(7.2);
  doc.text('Desenvolvido pelo Polo de Manutenção Suzano - OLMS', PAGE_W - 10, 9, { align: 'right' });
  doc.text('Eng° Eder Nunes.', PAGE_W - 10, 12.5, { align: 'right' });

  doc.setTextColor(...DARK);
  doc.setFontSize(8.3);
  doc.setFont('helvetica', 'bold');
  const subtitle = [report.obra.municipio, report.obra.endereco, report.obra.tipoObra, report.obra.aguaEsgoto]
    .filter(Boolean)
    .join('  |  ');
  doc.text(subtitle, PAGE_W / 2, 27.5, { align: 'center', maxWidth: 185 });

  doc.setDrawColor(...LINE_BLUE);
  doc.setLineWidth(0.7);
  doc.line(M, 31, PAGE_W - M, 31);
}

function section(doc: jsPDF, title: string, y: number) {
  doc.setFillColor(...BLUE);
  doc.roundedRect(M, y, PAGE_W - M * 2, 7, 1.2, 1.2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(title, M + 2, y + 4.8);
  doc.setTextColor(...DARK);
  return y + 9;
}

function infoTable(doc: jsPDF, rows: Array<[string, string]>, y: number) {
  const x = M;
  const w = PAGE_W - 2 * M;
  const labelW = 68;
  doc.setFontSize(8);
  rows.forEach(([label, value]) => {
    const rowH = 7;
    doc.setFillColor(240, 244, 246);
    doc.setDrawColor(200, 208, 214);
    doc.rect(x, y, labelW, rowH, 'FD');
    doc.rect(x + labelW, y, w - labelW, rowH);
    doc.setTextColor(...BLUE);
    doc.setFont('helvetica', 'bold');
    doc.text(label, x + 2, y + 4.7);
    doc.setTextColor(...DARK);
    doc.setFont('helvetica', 'normal');
    doc.text(String(value || ''), x + labelW + 2, y + 4.7, { maxWidth: w - labelW - 4 });
    y += rowH;
  });
  return y + 3;
}

function ensurePage(doc: jsPDF, report: Report, logo: string, y: number, needed = 15) {
  if (y + needed <= CONTENT_BOTTOM) return y;
  doc.addPage();
  addBaseHeader(doc, report, logo);
  return 36;
}

function wrap(doc: jsPDF, text: string, width: number) {
  return doc.splitTextToSize(String(text ?? ''), width) as string[];
}

function drawSummary(report: Report, doc: jsPDF, logo: string, startY: number) {
  // A tabela é construída linha a linha para termos controle total da quebra de página no celular.
  type Row = { item?: string; os?: string; tipo?: string; unid?: string; qtde?: number; unit?: number; total?: number; subtotal?: boolean; grand?: boolean };
  const rows: Row[] = [];
  let item = 1;
  const grouped = new Map<string, Row[]>();

  report.evidencias.forEach((ev) => ev.servicos.forEach((s) => {
    if (!s.tipo) return;
    const row: Row = {
      item: String(item++).padStart(2, '0'), os: ev.os, tipo: s.tipo, unid: s.unid,
      qtde: Number(s.qtde) || 0, unit: Number(s.precoUnit) || 0,
      total: (Number(s.qtde) || 0) * (Number(s.precoUnit) || 0),
    };
    const arr = grouped.get(s.tipo) || [];
    arr.push(row);
    grouped.set(s.tipo, arr);
  }));

  let grand = 0;
  grouped.forEach((group, tipo) => {
    group.forEach((r) => { rows.push(r); grand += r.total || 0; });
    rows.push({ tipo, unid: group[0]?.unid || '', qtde: group.reduce((a, r) => a + (r.qtde || 0), 0), total: group.reduce((a, r) => a + (r.total || 0), 0), subtotal: true });
  });
  rows.push({ total: grand, grand: true });

  const widths = [12, 24, 70, 14, 17, 26, 27];
  const headers = ['Item', 'Nº OS', 'Tipo de Serviço', 'Unid.', 'Qtde.', 'Preço Unit.', 'Total'];
  let y = startY;

  const drawHeader = () => {
    y = ensurePage(doc, report, logo, y, 12);
    let x = M;
    doc.setFontSize(7.2);
    doc.setFont('helvetica', 'bold');
    headers.forEach((h, i) => {
      doc.setFillColor(237, 242, 245);
      doc.setDrawColor(200, 208, 214);
      doc.rect(x, y, widths[i], 7, 'FD');
      doc.setTextColor(...BLUE);
      doc.text(h, x + 1, y + 4.6, { maxWidth: widths[i] - 2, align: i >= 4 ? 'right' : 'left' });
      x += widths[i];
    });
    doc.setTextColor(...DARK);
    y += 7;
  };
  drawHeader();

  rows.forEach((r) => {
    y = ensurePage(doc, report, logo, y, 9);
    if (y === 36) drawHeader();
    const values = r.grand
      ? ['', '', 'TOTAL GERAL', '', '', '', moneyBR(r.total || 0)]
      : r.subtotal
        ? ['', '', `SUBTOTAL — ${r.tipo}`, r.unid || '', numberBR(r.qtde || 0), '', moneyBR(r.total || 0)]
        : [r.item || '', r.os || '', r.tipo || '', r.unid || '', numberBR(r.qtde || 0), moneyBR(r.unit || 0), moneyBR(r.total || 0)];

    const textLines = values.map((v, i) => wrap(doc, v, widths[i] - 2));
    const rowH = Math.max(7, Math.max(...textLines.map((l) => l.length)) * 4.1 + 2);
    y = ensurePage(doc, report, logo, y, rowH + 1);
    if (y === 36) drawHeader();
    let x = M;
    values.forEach((_v, i) => {
      if (r.subtotal || r.grand) doc.setFillColor(231, 243, 248);
      else doc.setFillColor(255, 255, 255);
      doc.setDrawColor(200, 208, 214);
      doc.rect(x, y, widths[i], rowH, 'FD');
      doc.setFont('helvetica', r.subtotal || r.grand ? 'bold' : 'normal');
      doc.setFontSize(7.1);
      doc.setTextColor(r.subtotal || r.grand ? 7 : DARK[0], r.subtotal || r.grand ? 95 : DARK[1], r.subtotal || r.grand ? 128 : DARK[2]);
      const align = i >= 4 ? 'right' : 'left';
      const tx = align === 'right' ? x + widths[i] - 1 : x + 1;
      doc.text(textLines[i], tx, y + 4.2, { align, maxWidth: widths[i] - 2 });
      x += widths[i];
    });
    y += rowH;
  });
  return y + 3;
}

function getImageFormat(dataUrl: string): 'JPEG' | 'PNG' {
  return dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
}

function imageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

async function addImageFit(doc: jsPDF, dataUrl: string, x: number, y: number, w: number, h: number) {
  const size = await imageDimensions(dataUrl);
  const scale = Math.min(w / size.width, h / size.height);
  const dw = size.width * scale;
  const dh = size.height * scale;
  doc.addImage(dataUrl, getImageFormat(dataUrl), x + (w - dw) / 2, y + (h - dh) / 2, dw, dh, undefined, 'FAST');
}

async function tiffToDataUrls(file: StoredFile): Promise<string[]> {
  const bytes = dataUrlToUint8(file.data);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const ifds = UTIF.decode(buffer);
  const images: string[] = [];
  for (const ifd of ifds) {
    UTIF.decodeImage(buffer, ifd);
    const rgba = UTIF.toRGBA8(ifd);
    const canvas = document.createElement('canvas');
    canvas.width = ifd.width;
    canvas.height = ifd.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), ifd.width, ifd.height), 0, 0);
    images.push(canvas.toDataURL('image/jpeg', 0.9));
  }
  return images;
}

async function addEvidencePages(doc: jsPDF, report: Report, logo: string) {
  for (let ei = 0; ei < report.evidencias.length; ei += 1) {
    const ev = report.evidencias[ei];
    doc.addPage();
    addBaseHeader(doc, report, logo);
    let y = section(doc, `Evidência ${String(ei + 1).padStart(2, '0')}`, 36);
    y = infoTable(doc, [['Número de OS relacionada', ev.os]], y);

    // Tabela dos serviços vinculados à mesma evidência.
    const widths = [72, 25, 17, 18, 29, 29];
    const headers = ['Tipo de Serviço', 'Nº Preço', 'Unid.', 'Qtde.', 'Preço Unit.', 'Total'];
    let x = M;
    doc.setFontSize(7.1);
    headers.forEach((h, i) => {
      doc.setFillColor(237, 242, 245); doc.setDrawColor(200, 208, 214); doc.rect(x, y, widths[i], 7, 'FD');
      doc.setTextColor(...BLUE); doc.setFont('helvetica', 'bold'); doc.text(h, x + 1, y + 4.6, { maxWidth: widths[i] - 2 }); x += widths[i];
    });
    y += 7;
    for (const s of ev.servicos) {
      const vals = [s.tipo, s.preco, s.unid, numberBR(s.qtde), moneyBR(s.precoUnit), moneyBR((Number(s.qtde) || 0) * (Number(s.precoUnit) || 0))];
      const lines = vals.map((v, i) => wrap(doc, v, widths[i] - 2));
      const rh = Math.max(7, Math.max(...lines.map((l) => l.length)) * 4 + 2);
      y = ensurePage(doc, report, logo, y, rh + 2);
      x = M;
      vals.forEach((_v, i) => {
        doc.setDrawColor(200, 208, 214); doc.rect(x, y, widths[i], rh);
        doc.setTextColor(...DARK); doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
        doc.text(lines[i], x + 1, y + 4.2, { maxWidth: widths[i] - 2 }); x += widths[i];
      });
      y += rh;
    }
    if (ev.observacao) y = infoTable(doc, [['Observação', ev.observacao]], y + 2);

    // Fotos: duas por linha, com "Descrição:" em negrito somente quando houver texto.
    for (let i = 0; i < ev.fotos.length; i += 2) {
      y = ensurePage(doc, report, logo, y, 86);
      const pair = ev.fotos.slice(i, i + 2);
      for (let p = 0; p < pair.length; p += 1) {
        const photo = pair[p];
        const px = M + p * 96;
        doc.setDrawColor(207, 215, 221); doc.roundedRect(px, y, 92, 68, 1.5, 1.5);
        await addImageFit(doc, photo.data, px + 1, y + 1, 90, 66);
        if (photo.descricao) {
          doc.setFontSize(7.3); doc.setTextColor(...DARK); doc.setFont('helvetica', 'bold');
          doc.text('Descrição:', px, y + 73);
          const labelW = doc.getTextWidth('Descrição: ') + 1;
          doc.setFont('helvetica', 'normal');
          doc.text(wrap(doc, photo.descricao, 92 - labelW), px + labelW, y + 73);
        }
      }
      y += 80;
    }
  }
}

async function addImageAttachments(doc: jsPDF, report: Report, logo: string) {
  for (let i = 0; i < report.anexos.length; i += 1) {
    const a = report.anexos[i];
    const isPdf = /pdf/i.test(a.type) || /\.pdf$/i.test(a.name);
    if (isPdf) continue; // PDF é mesclado depois, sem virar imagem.

    const isTiff = /tiff?/i.test(a.type) || /\.tiff?$/i.test(a.name);
    const pages = isTiff ? await tiffToDataUrls(a) : [a.data];
    for (let p = 0; p < pages.length; p += 1) {
      doc.addPage(); addBaseHeader(doc, report, logo);
      let y = section(doc, `Anexo ${i + 1}${pages.length > 1 ? ` - página ${p + 1}` : ''}`, 36);
      if (p === 0 && a.descricao) {
        doc.setFontSize(8); doc.setTextColor(...DARK); doc.setFont('helvetica', 'bold'); doc.text('Descrição:', M, y + 3);
        doc.setFont('helvetica', 'normal'); doc.text(a.descricao, M + 18, y + 3, { maxWidth: 170 }); y += 7;
      }
      doc.setDrawColor(207, 215, 221); doc.rect(M, y, PAGE_W - 2 * M, CONTENT_BOTTOM - y - 2);
      await addImageFit(doc, pages[p], M + 2, y + 2, PAGE_W - 2 * M - 4, CONTENT_BOTTOM - y - 6);
    }
  }
}

async function buildBasePdf(report: Report) {
  const logo = await getLogoDataUrl();
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  addBaseHeader(doc, report, logo);
  let y = section(doc, '1. IDENTIFICAÇÃO DO RESPONSÁVEL PELA ELABORAÇÃO DO RELATÓRIO', 36);
  y = infoTable(doc, [
    ['Elaborado por', report.responsavel.elaboradoPor],
    ['Data', report.responsavel.data ? new Date(`${report.responsavel.data}T12:00:00`).toLocaleDateString('pt-BR') : ''],
    ['Cargo/Função', report.responsavel.cargo],
    ['Empresa', report.responsavel.empresa],
  ], y);
  y = section(doc, '2. INFORMAÇÕES DA OBRA', y);
  y = infoTable(doc, [
    ['Município', report.obra.municipio],
    ['Endereço', report.obra.endereco],
    ['Tipo de Serviço', report.obra.tipoObra],
    ['Água/Esgoto', report.obra.aguaEsgoto],
  ], y);
  y = section(doc, '3. RESUMO DOS SERVIÇOS NÃO VINCULADOS', y);
  drawSummary(report, doc, logo, y);

  await addEvidencePages(doc, report, logo);
  await addImageAttachments(doc, report, logo);
  return doc.output('arraybuffer');
}

async function mergePdfAttachments(baseBytes: ArrayBuffer, report: Report) {
  const out = await PDFDocument.load(baseBytes);
  for (const a of report.anexos) {
    const isPdf = /pdf/i.test(a.type) || /\.pdf$/i.test(a.name);
    if (!isPdf || !a.data) continue;
    try {
      const ext = await PDFDocument.load(dataUrlToUint8(a.data));
      const pages = await out.copyPages(ext, ext.getPageIndices());
      pages.forEach((p) => out.addPage(p));
    } catch (error) {
      // PDF protegido por senha ou corrompido não deve impedir a geração do restante do relatório.
      console.warn(`Não foi possível incorporar o anexo ${a.name}`, error);
    }
  }
  return out;
}

async function stampAllPages(pdf: PDFDocument) {
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const blue = rgb(17 / 255, 166 / 255, 204 / 255);
  const pages = pdf.getPages();
  pages.forEach((page, i) => {
    const { width } = page.getSize();
    // Rodapé: linha e letras exatamente no mesmo azul do cabeçalho.
    page.drawLine({ start: { x: 28, y: 35 }, end: { x: width - 28, y: 35 }, thickness: 1, color: blue });
    const footer = [
      'Companhia de Saneamento Básico do Estado de São Paulo – Sabesp',
      'Divisão de Manutenção e Serviços Operacionais Suzano - OLMS',
      'Rua Benjamin Constant 1980 - Centro | CEP 08674-179 | Suzano - SP',
      'www.sabesp.com.br',
    ];
    footer.forEach((line, idx) => page.drawText(line, { x: 28, y: 25 - idx * 6.5, size: 5.4, font, color: blue }));
    page.drawText(`${i + 1} de ${pages.length}`, { x: width - 58, y: 13, size: 6.2, font, color: blue });
  });
}

export type GeneratedPdf = { blob: Blob; url: string; fileName: string };

export async function generatePdf(report: Report): Promise<GeneratedPdf> {
  const base = await buildBasePdf(report);
  const merged = await mergePdfAttachments(base, report);
  await stampAllPages(merged);
  const bytes = await merged.save({ useObjectStreams: true });
  const blob = new Blob([bytes], { type: 'application/pdf' });
  return {
    blob,
    url: URL.createObjectURL(blob),
    fileName: `${fileNameBase(report, new Date())}.pdf`,
  };
}
