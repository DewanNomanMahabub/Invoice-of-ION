import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  FileDown,
  Plus,
  Trash2,
  RotateCcw,
  Droplets,
  CheckCircle2,
  Settings,
  CloudCheck,
  CloudOff,
} from 'lucide-react';
import './style.css';

const DEFAULT_PRODUCTS = [
  { name: 'ION Alkaline Packaged Drinking Water', volume: '330 mL' },
  { name: 'ION Alkaline Packaged Drinking Water', volume: '650 mL' },
  { name: 'ION Alkaline Packaged Drinking Water', volume: '5 L' },
  { name: 'ION Alkaline Packaged Drinking Water', volume: '20 L' },
];

const INVOICE_TYPES = [
  { key: 'Dealer', code: 'D', label: 'Dealer' },
  { key: 'Enterprise', code: 'E', label: 'Enterprise' },
  { key: 'Personal', code: 'P', label: 'Personal' },
  { key: 'Sample', code: 'S', label: 'Sample' },
];

const ENV_WEBHOOK = import.meta.env.VITE_SHEET_WEBHOOK_URL || '';

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const fmtInput = (n) => (Number.isFinite(n) ? String(round2(n)) : '');
const fmtNum = (n) =>
  Number(n || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const money = (n) =>
  `৳${Number(n || 0).toLocaleString('en-BD', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const blankRows = () =>
  DEFAULT_PRODUCTS.map((p, i) => ({
    id: `std-${i + 1}`,
    isCustom: false,
    name: p.name,
    volume: p.volume,
    qty: '',
    mrp: '',
    cpu: '',
    gp: '',
    lastEdited: 'gp',
  }));

function getRowMetrics(r) {
  const qty = Number(r.qty) || 0;
  const mrp = Number(r.mrp) || 0;
  const hasCpu = r.cpu !== '' && !Number.isNaN(Number(r.cpu));
  const hasGp = r.gp !== '' && !Number.isNaN(Number(r.gp));

  const cpu = hasCpu
    ? Number(r.cpu)
    : hasGp
      ? (mrp * (100 - Number(r.gp))) / 100
      : mrp;

  const gp = hasGp
    ? Number(r.gp)
    : mrp > 0
      ? ((mrp - cpu) / mrp) * 100
      : 0;

  const amount = qty * cpu;
  const discountValue = qty * Math.max(0, mrp - cpu);

  return { qty, mrp, cpu, gp, amount, discountValue };
}

function words(n) {
  n = Math.floor(Number(n) || 0);
  if (!n) return 'Zero';
  const a = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const under = (x) => (x < 20 ? a[x] : b[Math.floor(x / 10)] + (x % 10 ? ' ' + a[x % 10] : ''));
  const chunk = (x) => {
    let s = '';
    if (x >= 100) {
      s += a[Math.floor(x / 100)] + ' Hundred';
      x %= 100;
      if (x) s += ' ';
    }
    if (x) s += under(x);
    return s;
  };
  const parts = [];
  for (const [v, label] of [
    [10000000, 'Crore'],
    [100000, 'Lakh'],
    [1000, 'Thousand'],
    [1, ''],
  ]) {
    if (n >= v) {
      const q = Math.floor(n / v);
      parts.push(chunk(q) + (label ? ' ' + label : ''));
      n %= v;
    }
  }
  return parts.join(' ');
}

function makeFallbackId(typeKey) {
  const typeObj = INVOICE_TYPES.find((t) => t.key === typeKey) || INVOICE_TYPES[0];
  const now = new Date();
  const yymm = String(now.getFullYear()).slice(-2) + String(now.getMonth() + 1).padStart(2, '0');
  const storageKey = `ion_seq_${typeObj.code}_${yymm}`;
  const next = Number(localStorage.getItem(storageKey) || 0) + 1;
  localStorage.setItem(storageKey, String(next));
  return `ION-${typeObj.code}${yymm}-${String(next).padStart(4, '0')}`;
}

function App() {
  const [bill, setBill] = useState({
    customer: '',
    address: '',
    contact: '',
    date: new Date().toISOString().slice(0, 10),
    delivery: '0',
    notes: '',
    invoiceType: 'Dealer',
  });
  const [rows, setRows] = useState(blankRows);
  const [busy, setBusy] = useState(false);
  const [sheetUrl, setSheetUrl] = useState(
    () => localStorage.getItem('ion_sheet_webhook') || ENV_WEBHOOK
  );
  const [showSettings, setShowSettings] = useState(false);
  const [lastRecord, setLastRecord] = useState(null);

  const updateBill = (k, v) => setBill((s) => ({ ...s, [k]: v }));

  const saveSheetUrl = (val) => {
    setSheetUrl(val);
    localStorage.setItem('ion_sheet_webhook', val.trim());
  };

  // Bidirectional GP <-> CPU calculation
  const updateRow = (id, field, value) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;

        if (field === 'mrp') {
          const mrpNum = Number(value);
          if (value !== '' && mrpNum > 0) {
            if (r.lastEdited === 'cpu' && r.cpu !== '') {
              const gp = ((mrpNum - Number(r.cpu)) / mrpNum) * 100;
              return { ...r, mrp: value, gp: fmtInput(gp) };
            }
            if (r.gp !== '') {
              const cpu = (mrpNum * (100 - Number(r.gp))) / 100;
              return { ...r, mrp: value, cpu: fmtInput(cpu) };
            }
          }
          return { ...r, mrp: value };
        }

        if (field === 'gp') {
          if (value === '') {
            return { ...r, gp: '', cpu: '', lastEdited: 'gp' };
          }
          const mrpNum = Number(r.mrp);
          const cpu = mrpNum > 0 ? fmtInput((mrpNum * (100 - Number(value))) / 100) : r.cpu;
          return { ...r, gp: value, cpu, lastEdited: 'gp' };
        }

        if (field === 'cpu') {
          if (value === '') {
            return { ...r, cpu: '', gp: '', lastEdited: 'cpu' };
          }
          const mrpNum = Number(r.mrp);
          const gp = mrpNum > 0 ? fmtInput(((mrpNum - Number(value)) / mrpNum) * 100) : r.gp;
          return { ...r, cpu: value, gp, lastEdited: 'cpu' };
        }

        return { ...r, [field]: value };
      })
    );
  };

  const addCustomRow = () => {
    setRows((prev) => [
      ...prev,
      {
        id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        isCustom: true,
        name: '',
        volume: '',
        qty: '',
        mrp: '',
        cpu: '',
        gp: '',
        lastEdited: 'gp',
      },
    ]);
  };

  const removeCustomRow = (id) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const totals = useMemo(() => {
    const subtotal = rows.reduce((s, r) => s + getRowMetrics(r).amount, 0);
    const gp = rows.reduce((s, r) => s + getRowMetrics(r).discountValue, 0);
    const qty = rows.reduce((s, r) => s + (Number(r.qty) || 0), 0);
    const delivery = Number(bill.delivery) || 0;
    return { subtotal, gp, qty, delivery, total: subtotal + delivery };
  }, [rows, bill.delivery]);

  const active = rows.filter((r) => Number(r.qty) > 0);

  const reset = () => {
    if (confirm('Clear this invoice and start a new one?')) {
      setBill({
        customer: '',
        address: '',
        contact: '',
        date: new Date().toISOString().slice(0, 10),
        delivery: '0',
        notes: '',
        invoiceType: bill.invoiceType,
      });
      setRows(blankRows());
      setLastRecord(null);
    }
  };

  async function registerInvoiceInSheet(invoiceName) {
    const url = (sheetUrl || '').trim();
    if (!url) {
      return { invoiceId: makeFallbackId(bill.invoiceType), synced: false };
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          invoiceName,
          invoiceType: bill.invoiceType,
          deliveryDate: bill.date,
          total: round2(totals.total),
        }),
      });
      const data = await res.json();
      if (data && data.ok && data.invoiceId) {
        return { invoiceId: data.invoiceId, synced: true };
      }
      throw new Error(data?.error || 'Invalid response from Google Sheet');
    } catch (err) {
      console.warn('Google Sheet sync failed, using local fallback ID:', err);
      return { invoiceId: makeFallbackId(bill.invoiceType), synced: false };
    }
  }

  async function downloadPDF() {
    if (!bill.customer.trim()) {
      alert('Please enter the customer / Bill To name first.');
      return;
    }
    if (!active.length) {
      alert('Please enter a quantity for at least one product.');
      return;
    }
    const invalidCustom = active.find((r) => r.isCustom && !r.name.trim());
    if (invalidCustom) {
      alert('Please enter a product name for your custom product row.');
      return;
    }

    setBusy(true);
    try {
      const safeCustomer = (bill.customer || 'Customer').replace(/[^a-z0-9-_]+/gi, '_');
      const invoiceName = `${bill.customer.trim()} (${bill.date || 'No-Date'})`;

      // 1. Register in Google Sheet & get sequential Invoice ID
      const { invoiceId, synced } = await registerInvoiceInSheet(invoiceName);
      setLastRecord({ invoiceId, synced, type: bill.invoiceType });

      // 2. Build A4 PDF matching ION LIVE SCIENCE LIMITED INVOICE.docx
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const blue = [17, 57, 111];
      const darkText = [25, 25, 25];

      const loadImg = (src) =>
        new Promise((resolve, reject) => {
          const i = new Image();
          i.onload = () => resolve(i);
          i.onerror = reject;
          i.src = src;
        });

      const [logo, iso, watermark] = await Promise.all([
        loadImg('/image2.png'),
        loadImg('/image1.jpg'),
        loadImg('/image3.png'),
      ]);

      // Subtle centered watermark behind the table
      doc.saveGraphicsState();
      doc.setGState(new doc.GState({ opacity: 0.09 }));
      doc.addImage(watermark, 'PNG', 47, 82, 116, 116);
      doc.restoreGraphicsState();

      // Header: Left ION logo, Center Titles, Right ISO badge
      // Margins: left 13mm, right 13mm -> total content width = 184mm (x: 13 to 197)
      doc.addImage(logo, 'PNG', 13, 9, 26, 26);
      doc.addImage(iso, 'JPEG', 171, 9, 26, 26);

      doc.setTextColor(...blue);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(17);
      doc.text('ION LIVE SCIENCE LIMITED', 105, 16.5, { align: 'center' });
      doc.setFontSize(10);
      doc.text('FOR GOOD HEALTH', 105, 23, { align: 'center' });
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text('Since: 2017', 105, 28.5, { align: 'center' });
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.text('INVOICE', 105, 37.5, { align: 'center' });

      // Full-width divider aligned to table edges (13mm to 197mm)
      doc.setDrawColor(...blue);
      doc.setLineWidth(0.45);
      doc.line(13, 42, 197, 42);

      // Dynamic Customer Metadata (prevents Address from overlapping Contact)
      let metaY = 50;
      doc.setTextColor(...darkText);
      doc.setFontSize(9.5);

      doc.setFont('helvetica', 'bold');
      doc.text('Bill To:', 13, metaY);
      doc.setFont('helvetica', 'normal');
      const billToLines = doc.splitTextToSize(bill.customer.trim(), 112);
      doc.text(billToLines, 31, metaY);

      // Delivery Date on right side aligned to 197mm
      doc.setFont('helvetica', 'bold');
      doc.text('Delivery Date:', 148, metaY);
      doc.setFont('helvetica', 'normal');
      doc.text(bill.date || '—', 197, metaY, { align: 'right' });

      metaY += Math.max(1, billToLines.length) * 5.2 + 1.5;

      doc.setFont('helvetica', 'bold');
      doc.text('Address:', 13, metaY);
      doc.setFont('helvetica', 'normal');
      const addrLines = doc.splitTextToSize(bill.address.trim() || '—', 112);
      doc.text(addrLines, 31, metaY);

      metaY += Math.max(1, addrLines.length) * 5.2 + 1.5;

      doc.setFont('helvetica', 'bold');
      doc.text('Contact:', 13, metaY);
      doc.setFont('helvetica', 'normal');
      doc.text(bill.contact.trim() || '—', 31, metaY);

      const tableStartY = metaY + 7;

      // Build line items + grid-aligned Sub, Delivery, Total rows (exact 184mm width)
      const itemRows = active.map((r, i) => {
        const m = getRowMetrics(r);
        return [
          `${i + 1}.`,
          r.name.trim(),
          r.volume.trim() || '—',
          String(m.qty),
          m.mrp > 0 ? fmtNum(m.mrp) : '—',
          fmtNum(m.cpu),
          fmtNum(m.amount),
          `${round2(m.gp).toFixed(2)}%`,
        ];
      });

      const summaryStyleLabel = {
        fontStyle: 'bold',
        halign: 'right',
        fillColor: [244, 247, 251],
        textColor: blue,
      };
      const summaryStyleVal = {
        fontStyle: 'bold',
        halign: 'right',
        fillColor: [244, 247, 251],
        textColor: darkText,
      };
      const emptyMerge = {
        content: '',
        colSpan: 5,
        styles: { fillColor: [255, 255, 255] },
      };

      const summaryRows = [
        [
          emptyMerge,
          { content: 'Sub', styles: summaryStyleLabel },
          { content: fmtNum(totals.subtotal), styles: summaryStyleVal },
          { content: '', styles: { fillColor: [255, 255, 255] } },
        ],
        [
          emptyMerge,
          { content: 'Delivery', styles: summaryStyleLabel },
          { content: fmtNum(totals.delivery), styles: summaryStyleVal },
          { content: '', styles: { fillColor: [255, 255, 255] } },
        ],
        [
          emptyMerge,
          {
            content: 'Total',
            styles: { ...summaryStyleLabel, fillColor: [232, 240, 249], fontSize: 9 },
          },
          {
            content: `Tk ${fmtNum(totals.total)}`,
            styles: { ...summaryStyleVal, fillColor: [232, 240, 249], fontSize: 9 },
          },
          { content: '', styles: { fillColor: [232, 240, 249] } },
        ],
      ];

      // Column widths sum to EXACTLY 184mm: 9 + 65 + 18 + 16 + 19 + 19 + 22 + 16 = 184
      autoTable(doc, {
        startY: tableStartY,
        tableWidth: 184,
        margin: { left: 13, right: 13 },
        head: [['#', 'Product Description', 'Volume', 'Quantity', 'MRP', 'CPU', 'Amount', 'GP']],
        body: [...itemRows, ...summaryRows],
        theme: 'grid',
        styles: {
          font: 'helvetica',
          fontSize: 8.3,
          cellPadding: { top: 2.5, right: 2.2, bottom: 2.5, left: 2.2 },
          lineColor: [110, 120, 132],
          lineWidth: 0.2,
          textColor: darkText,
          valign: 'middle',
          overflow: 'linebreak',
        },
        headStyles: {
          fillColor: [232, 240, 249],
          textColor: blue,
          fontStyle: 'bold',
          halign: 'center',
          fontSize: 8.5,
        },
        columnStyles: {
          0: { cellWidth: 9, halign: 'center' },
          1: { cellWidth: 65, halign: 'left' },
          2: { cellWidth: 18, halign: 'center' },
          3: { cellWidth: 16, halign: 'center' },
          4: { cellWidth: 19, halign: 'right' },
          5: { cellWidth: 19, halign: 'right' },
          6: { cellWidth: 22, halign: 'right' },
          7: { cellWidth: 16, halign: 'right' },
        },
      });

      let y = doc.lastAutoTable.finalY + 8;

      // In Words & Check Bill
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.2);
      doc.setTextColor(...darkText);
      const wordsText = `In Words: ${words(totals.total)} Taka Only`;
      const wordsLines = doc.splitTextToSize(wordsText, 184);
      doc.text(wordsLines, 13, y);
      y += wordsLines.length * 4.8 + 1.5;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.8);
      doc.text('(Please check your bill).', 13, y);
      y += 6.5;

      if (bill.notes.trim()) {
        doc.setFont('helvetica', 'normal');
        const noteLines = doc.splitTextToSize(`Note: ${bill.notes.trim()}`, 184);
        doc.text(noteLines, 13, y);
        y += noteLines.length * 4.5 + 3;
      }

      // Payment N.B. matching .docx
      const nb =
        'N.B: Please pay your bill after receiving ION Alkaline Packaged Drinking Water through Account Payee Cheque in the name of "ION LIVE SCIENCE LIMITED" OR through Company Bkash Number: 01682775957. For Order Placement or Any Complaints, please contact 01408493185.';
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.6);
      doc.setTextColor(45, 55, 68);
      doc.text(nb, 13, Math.min(y + 1, 234), { maxWidth: 184, lineHeightFactor: 1.38 });

      // Signatures (Seller left, Customer right + exact verification note)
      const sigY = 259;
      doc.setDrawColor(40, 40, 40);
      doc.setLineWidth(0.3);
      doc.line(13, sigY, 68, sigY);
      doc.line(142, sigY, 197, sigY);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...darkText);
      doc.text('Seller Signature', 40.5, sigY + 5, { align: 'center' });
      doc.text('Customer Signature', 169.5, sigY + 5, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(70, 78, 88);
      doc.text(
        '(I am verifying that the\nWater quality is good,\nthose I received)',
        169.5,
        sigY + 9.5,
        { align: 'center', lineHeightFactor: 1.25 }
      );

      // Certification Footer + Subtle Tracking Invoice ID at the bottom
      doc.setDrawColor(210, 218, 228);
      doc.setLineWidth(0.2);
      doc.line(13, 279, 197, 279);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.4);
      doc.setTextColor(...blue);
      doc.text(
        'ION Live Science Ltd.\'s Alkaline Water is: BSTI & ISO 9001:2015 certified, SGS Singapore verified and fully comply with ICDDRB.',
        105,
        283.5,
        { align: 'center', maxWidth: 184 }
      );

      // Discreet Invoice ID at very bottom (does NOT display the invoice type name)
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(110, 120, 132);
      doc.text(`Invoice ID: ${invoiceId}`, 105, 289.5, { align: 'center' });

      doc.save(`${invoiceId}-${safeCustomer}.pdf`);
    } catch (e) {
      console.error(e);
      alert('Could not create the PDF. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <img src="/image2.png" alt="ION Logo" />
          <div>
            <strong>ION LIVE SCIENCE</strong>
            <span>INVOICE STUDIO</span>
          </div>
        </div>
        <div className="top-actions">
          <span className={`secure ${sheetUrl ? '' : 'offline'}`}>
            {sheetUrl ? <CloudCheck size={15} /> : <CloudOff size={15} />}
            {sheetUrl ? 'Sheet Connected' : 'Local ID Mode'}
          </span>
          <button
            className="btn ghost"
            onClick={() => setShowSettings((s) => !s)}
            title="Configure Google Sheet Sync"
          >
            <Settings size={16} /> Sheet Setup
          </button>
          <button className="btn ghost" onClick={reset}>
            <RotateCcw size={16} /> Reset
          </button>
        </div>
      </header>

      {showSettings && (
        <div className="settings-bar">
          <div className="settings-inner">
            <label>
              Google Apps Script Web App URL (for automatic Invoice ID &amp; Sheet tracking)
              <input
                type="url"
                value={sheetUrl}
                onChange={(e) => saveSheetUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/AKfycb.../exec"
              />
            </label>
            <button className="btn primary" onClick={() => setShowSettings(false)}>
              Done
            </button>
          </div>
        </div>
      )}

      <main className="layout">
        <section className="editor">
          <div className="intro">
            <div className="eyebrow">
              <Droplets size={15} /> SALES DOCUMENTS
            </div>
            <h1>Create an invoice</h1>
            <p>Enter either GP (%) or CPU (৳)—the other calculates automatically.</p>
          </div>

          <section className="panel">
            <div className="section-title">
              <span className="step">01</span>
              <div>
                <h2>Invoice tracking type &amp; customer details</h2>
                <p>Invoice type is for internal Google Sheet tracking only (not shown on PDF).</p>
              </div>
            </div>

            <div className="type-selector">
              {INVOICE_TYPES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={`type-pill ${bill.invoiceType === t.key ? 'active' : ''}`}
                  onClick={() => updateBill('invoiceType', t.key)}
                >
                  <span>{t.label}</span>
                  <small>Code: {t.code}</small>
                </button>
              ))}
            </div>

            <div className="form-grid">
              <label className="full">
                Bill To
                <input
                  value={bill.customer}
                  onChange={(e) => updateBill('customer', e.target.value)}
                  placeholder="Customer or organization name"
                />
              </label>
              <label className="full">
                Address
                <textarea
                  rows="2"
                  value={bill.address}
                  onChange={(e) => updateBill('address', e.target.value)}
                  placeholder="Delivery address"
                />
              </label>
              <label>
                Contact number
                <input
                  value={bill.contact}
                  onChange={(e) => updateBill('contact', e.target.value)}
                  placeholder="01XXXXXXXXX"
                />
              </label>
              <label>
                Delivery date
                <input
                  type="date"
                  value={bill.date}
                  onChange={(e) => updateBill('date', e.target.value)}
                />
              </label>
            </div>
          </section>

          <section className="panel">
            <div className="section-title">
              <span className="step">02</span>
              <div>
                <h2>Product details</h2>
                <p>Enter Qty, MRP, and either CPU or GP (%). Add custom items below if needed.</p>
              </div>
            </div>

            <div className="product-list">
              {rows.map((r, i) => {
                const m = getRowMetrics(r);
                return (
                  <div className={`product-row ${r.isCustom ? 'custom-row' : ''}`} key={r.id}>
                    <div className="product-name">
                      <span className="product-index">{String(i + 1).padStart(2, '0')}</span>
                      {r.isCustom ? (
                        <div className="custom-fields">
                          <input
                            type="text"
                            value={r.name}
                            onChange={(e) => updateRow(r.id, 'name', e.target.value)}
                            placeholder="Product description"
                          />
                          <input
                            type="text"
                            value={r.volume}
                            onChange={(e) => updateRow(r.id, 'volume', e.target.value)}
                            placeholder="Size / Volume (e.g. 1 L)"
                          />
                        </div>
                      ) : (
                        <div>
                          <strong>{r.volume}</strong>
                          <small>{r.name}</small>
                        </div>
                      )}
                    </div>

                    <label>
                      Qty
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={r.qty}
                        onChange={(e) => updateRow(r.id, 'qty', e.target.value)}
                        placeholder="0"
                      />
                    </label>

                    <label>
                      MRP (৳)
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={r.mrp}
                        onChange={(e) => updateRow(r.id, 'mrp', e.target.value)}
                        placeholder="0.00"
                      />
                    </label>

                    <label>
                      CPU (৳)
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={r.cpu}
                        onChange={(e) => updateRow(r.id, 'cpu', e.target.value)}
                        placeholder="Auto"
                      />
                    </label>

                    <label>
                      GP (%)
                      <input
                        type="number"
                        step="0.01"
                        value={r.gp}
                        onChange={(e) => updateRow(r.id, 'gp', e.target.value)}
                        placeholder="Auto"
                      />
                    </label>

                    <div className="line-total">
                      <small>Amount</small>
                      <strong>{money(m.amount)}</strong>
                      {r.isCustom && (
                        <button
                          type="button"
                          className="icon-delete"
                          onClick={() => removeCustomRow(r.id)}
                          title="Remove custom product"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <button type="button" className="btn add-product" onClick={addCustomRow}>
              <Plus size={16} /> Add custom product
            </button>

            <div className="formula-note">
              <span>CPU = MRP × (100 − GP%) ÷ 100</span>
              <span>GP% = ((MRP − CPU) ÷ MRP) × 100</span>
              <span>Amount = Qty × CPU</span>
            </div>
          </section>

          <section className="panel">
            <div className="section-title">
              <span className="step">03</span>
              <div>
                <h2>Additional charges</h2>
                <p>Delivery charge is added to the subtotal.</p>
              </div>
            </div>
            <div className="form-grid">
              <label>
                Delivery charge (৳)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={bill.delivery}
                  onChange={(e) => updateBill('delivery', e.target.value)}
                />
              </label>
              <label className="full">
                Optional note
                <input
                  value={bill.notes}
                  onChange={(e) => updateBill('notes', e.target.value)}
                  placeholder="Any additional note for this invoice"
                />
              </label>
            </div>
          </section>

          <button className="btn primary generate" onClick={downloadPDF} disabled={busy}>
            <FileDown size={18} />
            {busy ? 'Syncing & Preparing PDF…' : 'Generate ID, Sync & Download PDF'}
          </button>

          {lastRecord && (
            <div className={`sync-banner ${lastRecord.synced ? 'ok' : 'warn'}`}>
              <CheckCircle2 size={15} />
              <span>
                Generated <strong>{lastRecord.invoiceId}</strong> ({lastRecord.type}) —{' '}
                {lastRecord.synced
                  ? 'Logged to Google Sheet'
                  : 'Saved locally (connect Sheet URL to sync online)'}
              </span>
            </div>
          )}
        </section>

        <aside className="preview-column">
          <div className="preview-heading">
            <div>
              <span className="eyebrow">LIVE SUMMARY</span>
              <h2>Invoice totals</h2>
            </div>
            <span className="live-dot">LIVE</span>
          </div>
          <div className="summary-card">
            <div className="summary-main">
              <span>Invoice total</span>
              <strong>{money(totals.total)}</strong>
              <small>Bangladeshi Taka (BDT)</small>
            </div>
            <div className="summary-line">
              <span>Tracking type (hidden)</span>
              <strong>{bill.invoiceType}</strong>
            </div>
            <div className="summary-line">
              <span>Items quantity</span>
              <strong>{totals.qty}</strong>
            </div>
            <div className="summary-line">
              <span>Subtotal (CPU × Qty)</span>
              <strong>{money(totals.subtotal)}</strong>
            </div>
            <div className="summary-line">
              <span>Delivery charge</span>
              <strong>{money(totals.delivery)}</strong>
            </div>
            <div className="summary-line profit">
              <span>Total discount value</span>
              <strong>{money(totals.gp)}</strong>
            </div>
            <div className="summary-words">
              <small>AMOUNT IN WORDS</small>
              <p>{words(totals.total)} Taka Only</p>
            </div>
          </div>

          <div className="help-card">
            <div className="help-icon">
              <FileDown size={19} />
            </div>
            <div>
              <strong>A4 Print-Ready PDF</strong>
              <p>
                Aligned 184 mm table grid with ION logo, ISO mark, payment note, signatures, and
                bottom tracking ID.
              </p>
            </div>
          </div>
          <div className="mini-brand">
            <img src="/image1.jpg" alt="ISO 9001:2015" />
            <span>
              ION LIVE SCIENCE LIMITED
              <br />
              <small>For Good Health · Since 2017</small>
            </span>
          </div>
        </aside>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);