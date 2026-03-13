import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface CatalogProduct {
  sku: string;
  name: string;
  category: string | null;
  price_cents: number;
  wholesale_price_cents: number | null;
  stock_qty: number;
  is_active: boolean;
  description: string | null;
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export function generateCatalogPdf(products: CatalogProduct[], storeName?: string): void {
  const title = storeName ? `${storeName} — Product Catalog` : 'Product Catalog';
  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // ── Header ──────────────────────────────────────────────────
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 14, 18);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text(`Generated ${dateStr}  •  ${products.length} products`, 14, 25);
  doc.setTextColor(0);

  // ── Table ───────────────────────────────────────────────────
  const tableData = products.map((p) => [
    p.sku,
    p.name,
    p.category ?? '—',
    formatPrice(p.price_cents),
    p.wholesale_price_cents != null ? formatPrice(p.wholesale_price_cents) : '—',
    String(p.stock_qty),
    p.is_active ? 'Active' : 'Inactive',
    (p.description ?? '').length > 80
      ? (p.description ?? '').slice(0, 77) + '…'
      : (p.description ?? '—'),
  ]);

  autoTable(doc, {
    startY: 30,
    head: [['SKU', 'Name', 'Category', 'Price', 'W/S Price', 'Stock', 'Status', 'Description']],
    body: tableData,
    styles: {
      fontSize: 8,
      cellPadding: 2,
    },
    headStyles: {
      fillColor: [15, 23, 42],   // slate-900 — matches admin theme
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    columnStyles: {
      0: { cellWidth: 25, font: 'courier' },          // SKU
      1: { cellWidth: 45, fontStyle: 'bold' },         // Name
      2: { cellWidth: 25 },                            // Category
      3: { cellWidth: 22, halign: 'right' },           // Price
      4: { cellWidth: 22, halign: 'right' },           // W/S Price
      5: { cellWidth: 15, halign: 'right' },           // Stock
      6: { cellWidth: 18, halign: 'center' },          // Status
      7: { cellWidth: 'auto' },                        // Description
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],  // slate-50
    },
    didDrawPage: (data) => {
      // Footer: page numbers
      const pageCount = (doc as any).internal.getNumberOfPages();
      const currentPage = (doc as any).internal.getCurrentPageInfo().pageNumber;
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `Page ${currentPage} of ${pageCount}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 8,
        { align: 'center' },
      );
      doc.setTextColor(0);
    },
  });

  // ── Download ────────────────────────────────────────────────
  const dateSlug = new Date().toISOString().slice(0, 10);
  doc.save(`catalog-${dateSlug}.pdf`);
}
