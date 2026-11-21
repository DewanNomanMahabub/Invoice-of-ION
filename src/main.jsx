import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FileDown, Plus, Trash2, RotateCcw, Droplets, CheckCircle2 } from 'lucide-react';
import './style.css';

const products = [
  { name: 'ION Alkaline Packaged Drinking Water', volume: '330 mL' },
  { name: 'ION Alkaline Packaged Drinking Water', volume: '650 mL' },
  { name: 'ION Alkaline Packaged Drinking Water', volume: '5 L' },
  { name: 'ION Alkaline Packaged Drinking Water', volume: '20 L' },
];
const money = n => `৳${Number(n || 0).toLocaleString('en-BD',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const blankRows = () => products.map((p,i)=>({ ...p, id:i+1, qty:'', mrp:'', gp:'' }));
function words(n) {
  n = Math.floor(Number(n)||0);
  if (!n) return 'Zero';
  const a=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const b=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const under=x=>x<20?a[x]:b[Math.floor(x/10)]+(x%10?' '+a[x%10]:'');
  const chunk=x=>{let s='';if(x>=100){s+=a[Math.floor(x/100)]+' Hundred';x%=100;if(x)s+=' ';}if(x)s+=under(x);return s;};
  let parts=[];
  for (const [v,label] of [[10000000,'Crore'],[100000,'Lakh'],[1000,'Thousand'],[1,'']]) {
    if(n>=v){let q=Math.floor(n/v);parts.push(chunk(q)+(label?' '+label:''));n%=v;}
  }
  return parts.join(' ');
}
function App(){
 const [bill,setBill]=useState({customer:'',address:'',contact:'',date:new Date().toISOString().slice(0,10),delivery:'0',notes:''});
 const [rows,setRows]=useState(blankRows);
 const [busy,setBusy]=useState(false);
 const updateBill=(k,v)=>setBill(s=>({...s,[k]:v}));
 const updateRow=(id,k,v)=>setRows(s=>s.map(r=>r.id===id?{...r,[k]:v}:r));
 const totals=useMemo(()=>{
   const subtotal=rows.reduce((s,r)=>s+(Number(r.qty)||0)*(Number(r.mrp)||0)*(100-(Number(r.gp)||0))/100,0);
   const gp=rows.reduce((s,r)=>s+(Number(r.qty)||0)*(Number(r.mrp)||0)*(Number(r.gp)||0)/100,0);
   const qty=rows.reduce((s,r)=>s+(Number(r.qty)||0),0);
   const delivery=Number(bill.delivery)||0;
   return {subtotal,gp,qty,delivery,total:subtotal+delivery};
 },[rows,bill.delivery]);
 const active=rows.filter(r=>Number(r.qty)>0);
 const reset=()=>{if(confirm('Clear this invoice and start a new one?')){setBill({customer:'',address:'',contact:'',date:new Date().toISOString().slice(0,10),delivery:'0',notes:''});setRows(blankRows());}};
 async function downloadPDF(){
  if(!bill.customer.trim()){alert('Please enter the customer / Bill To name first.');return;}
  if(!active.length){alert('Please enter a quantity for at least one product.');return;}
  setBusy(true);
  try {
   const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
   const W=210, blue=[17,57,111], green=[22,125,88];
   const img=(src)=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src;});
   const [logo,iso,watermark]=await Promise.all([img('/image2.png'),img('/image1.jpg'),img('/image3.png')]);
   // light watermark behind the item table
   doc.saveGraphicsState();
   doc.setGState(new doc.GState({opacity:0.10}));
   doc.addImage(watermark,'PNG',47,75,116,116);
   doc.restoreGraphicsState();
   doc.addImage(logo,'PNG',13,9,26,27);
   doc.addImage(iso,'JPEG',171,9,26,26);
   doc.setTextColor(...blue);doc.setFont('helvetica','bold');doc.setFontSize(17);
   doc.text('ION LIVE SCIENCE LIMITED',105,17,{align:'center'});
   doc.setFontSize(10);doc.text('FOR GOOD HEALTH',105,24,{align:'center'});
   doc.setFontSize(9);doc.text('Since: 2017',105,30,{align:'center'});
   doc.setFontSize(16);doc.text('INVOICE',105,39,{align:'center'});
   doc.setDrawColor(...blue);doc.setLineWidth(.45);doc.line(13,44,197,44);
   doc.setTextColor(25);doc.setFont('helvetica','normal');doc.setFontSize(10);
   doc.text(`Bill To: ${bill.customer}`,14,54);
   doc.text(`Address: ${bill.address||'—'}`,14,61,{maxWidth:125});
   doc.text(`Contact: ${bill.contact||'—'}`,14,68);
   doc.setFont('helvetica','bold');doc.text('Delivery Date:',151,54);
   doc.setFont('helvetica','normal');doc.text(bill.date||'—',151,61);
   const body=active.map((r,i)=>{
    const cpu=(Number(r.mrp)||0)*(100-(Number(r.gp)||0))/100;
    return [String(i+1),`${r.name}`,r.volume,String(r.qty),
      Number(r.mrp||0).toFixed(2),cpu.toFixed(2),
      (Number(r.qty)*cpu).toFixed(2),`${Number(r.gp||0).toFixed(2)}%`];
   });
   autoTable(doc,{startY:77,head:[['#','Product Description','Volume','Quantity','MRP','CPU','Amount','GP']],body,
    theme:'grid',styles:{font:'helvetica',fontSize:8.2,cellPadding:2.4,lineColor:[90,90,90],lineWidth:.18,textColor:[25,25,25],valign:'middle'},
    headStyles:{fillColor:[235,241,248],textColor:blue,fontStyle:'bold',halign:'center'},
    columnStyles:{0:{cellWidth:8,halign:'center'},1:{cellWidth:59},2:{cellWidth:17,halign:'center'},3:{cellWidth:17,halign:'right'},4:{cellWidth:18,halign:'right'},5:{cellWidth:18,halign:'right'},6:{cellWidth:20,halign:'right'},7:{cellWidth:18,halign:'right'}},
    margin:{left:13,right:13}
   });
   let y=doc.lastAutoTable.finalY+7;
   doc.setFont('helvetica','normal');doc.setFontSize(10);
   const sx=143, vx=195;
   doc.text('Subtotal',sx,y);doc.text(money(totals.subtotal),vx,y,{align:'right'});y+=7;
   doc.text('Delivery Charge',sx,y);doc.text(money(totals.delivery),vx,y,{align:'right'});y+=2;
   doc.setDrawColor(...blue);doc.line(135,y,197,y);y+=7;
   doc.setFont('helvetica','bold');doc.text('Total',sx,y);doc.text(money(totals.total),vx,y,{align:'right'});y+=9;
   doc.setFontSize(9);doc.text(`In Words: Taka ${words(totals.total)} Only`,14,y,{maxWidth:180});y+=7;
   doc.setFont('helvetica','bold');doc.text('(Please check your bill).',14,y);y+=12;
   if(bill.notes){doc.setFont('helvetica','normal');doc.text(`Note: ${bill.notes}`,14,y,{maxWidth:180});y+=8;}
   const nb='N.B: Please pay your bill after receiving ION Alkaline Packaged Drinking Water through Account Payee Cheque in the name of “ION LIVE SCIENCE LIMITED” OR through Company Bkash Number: 01682775957. For Order Placement or Any Complaints, please contact 01408493185.';
   doc.setFont('helvetica','italic');doc.setFontSize(9);doc.text(nb,14,Math.min(y,240),{maxWidth:182,lineHeightFactor:1.35});
   const sigY=265;doc.setDrawColor(30);doc.line(14,sigY,70,sigY);doc.line(140,sigY,197,sigY);
   doc.setFont('helvetica','bold');doc.setFontSize(9);doc.text('Seller Signature',14,sigY+5);doc.text('Customer Signature',197,sigY+5,{align:'right'});
   doc.setFont('helvetica','normal');doc.setFontSize(8);doc.text('Water quality is good, those I received.',197,280,{align:'right'});
   doc.setFontSize(7);doc.setTextColor(80);doc.text('ION Live Science Ltd.’s Alkaline Water is BSTI & ISO 9001:2015 certified, SGS Singapore verified and fully comply with ICDDRB.',105,289,{align:'center',maxWidth:184});
   const safe=(bill.customer||'Customer').replace(/[^a-z0-9-_]+/gi,'_');
   doc.save(`ION-Invoice-${safe}-${bill.date||'date'}.pdf`);
  } catch(e){console.error(e);alert('Could not create the PDF. Please try again.');}
  finally{setBusy(false);}
 }
 return <div className="app-shell">
  <header className="topbar"><div className="brand"><img src="/image2.png"/><div><strong>ION LIVE SCIENCE</strong><span>INVOICE STUDIO</span></div></div><div className="top-actions"><span className="secure"><CheckCircle2 size={15}/> Ready to generate</span><button className="btn ghost" onClick={reset}><RotateCcw size={16}/> Reset</button></div></header>
  <main className="layout">
   <section className="editor">
    <div className="intro"><div className="eyebrow"><Droplets size={15}/> SALES DOCUMENTS</div><h1>Create an invoice</h1><p>Enter the delivery and product details. Your totals update automatically.</p></div>
    <section className="panel"><div className="section-title"><span className="step">01</span><div><h2>Customer details</h2><p>Who is receiving this order?</p></div></div>
     <div className="form-grid">
      <label className="full">Bill To <input value={bill.customer} onChange={e=>updateBill('customer',e.target.value)} placeholder="Customer or organization name"/></label>
      <label className="full">Address <textarea rows="2" value={bill.address} onChange={e=>updateBill('address',e.target.value)} placeholder="Delivery address"/></label>
      <label>Contact number <input value={bill.contact} onChange={e=>updateBill('contact',e.target.value)} placeholder="01XXXXXXXXX"/></label>
      <label>Delivery date <input type="date" value={bill.date} onChange={e=>updateBill('date',e.target.value)}/></label>
     </div>
    </section>
    <section className="panel"><div className="section-title"><span className="step">02</span><div><h2>Product details</h2><p>Enter quantity, MRP and GP (discount percentage) for each size.</p></div></div>
     <div className="product-list">{rows.map((r,i)=><div className="product-row" key={r.id}><div className="product-name"><span className="product-index">0{i+1}</span><div><strong>{r.volume}</strong><small>ION Alkaline Packaged Drinking Water</small></div></div>
      <label>Qty<input type="number" min="0" step="1" value={r.qty} onChange={e=>updateRow(r.id,'qty',e.target.value)} placeholder="0"/></label>
      <label>MRP (৳)<input type="number" min="0" step="0.01" value={r.mrp} onChange={e=>updateRow(r.id,'mrp',e.target.value)} placeholder="0.00"/></label>
      <label>GP (%)<input type="number" min="0" max="100" step="0.01" value={r.gp} onChange={e=>updateRow(r.id,'gp',e.target.value)} placeholder="0"/></label>
      <div className="line-total"><small>CPU / Amount</small><strong>{money((Number(r.mrp)||0)*(100-(Number(r.gp)||0))/100)} / {money((Number(r.qty)||0)*(Number(r.mrp)||0)*(100-(Number(r.gp)||0))/100)}</strong></div>
     </div>)}</div>
     <div className="formula-note"><span>CPU = MRP × (100 − GP%) ÷ 100</span><span>Amount = Quantity × CPU</span></div>
    </section>
    <section className="panel"><div className="section-title"><span className="step">03</span><div><h2>Additional charges</h2><p>Delivery charge is added to the subtotal.</p></div></div>
     <div className="form-grid"><label>Delivery charge (৳)<input type="number" min="0" step="0.01" value={bill.delivery} onChange={e=>updateBill('delivery',e.target.value)}/></label><label className="full">Optional note <input value={bill.notes} onChange={e=>updateBill('notes',e.target.value)} placeholder="Any additional note for this invoice"/></label></div>
    </section>
    <button className="btn primary generate" onClick={downloadPDF} disabled={busy}><FileDown size={18}/>{busy?'Preparing PDF…':'Download completed invoice (PDF)'}</button>
    <p className="privacy-note">Your invoice is generated in your browser. Customer and invoice details are not uploaded to a server.</p>
   </section>
   <aside className="preview-column"><div className="preview-heading"><div><span className="eyebrow">LIVE SUMMARY</span><h2>Invoice totals</h2></div><span className="live-dot">LIVE</span></div>
    <div className="summary-card"><div className="summary-main"><span>Invoice total</span><strong>{money(totals.total)}</strong><small>Bangladeshi Taka (BDT)</small></div>
     <div className="summary-line"><span>Items quantity</span><strong>{totals.qty}</strong></div>
     <div className="summary-line"><span>Subtotal (CPU × Qty)</span><strong>{money(totals.subtotal)}</strong></div>
     <div className="summary-line"><span>Delivery charge</span><strong>{money(totals.delivery)}</strong></div>
     <div className="summary-line profit"><span>Total discount value</span><strong>{money(totals.gp)}</strong></div>
     <div className="summary-words"><small>AMOUNT IN WORDS</small><p>Taka {words(totals.total)} Only</p></div>
    </div>
    <div className="help-card"><div className="help-icon"><FileDown size={19}/></div><div><strong>PDF invoice</strong><p>Formatted to A4 with your company logo, ISO mark, payment instructions and signature lines.</p></div></div>
    <div className="mini-brand"><img src="/image1.jpg"/><span>ION LIVE SCIENCE LIMITED<br/><small>For Good Health · Since 2017</small></span></div>
   </aside>
  </main>
 </div>
}
createRoot(document.getElementById('root')).render(<App/>);
