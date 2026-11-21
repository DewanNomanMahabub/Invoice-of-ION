# ION Live Science Invoice Studio

A Vercel-ready React + Vite invoice generator based on the supplied ION LIVE SCIENCE LIMITED invoice template.

## Features
- Customer, address, contact and delivery date fields
- Four standard ION product sizes (330 mL, 650 mL, 5 L, 20 L)
- Quantity, MRP and GP (discount percentage) inputs; CPU and amount are calculated automatically
- Delivery charge, subtotal, total and amount-in-words calculation
- A4 PDF download with the supplied ION logo and ISO mark, payment details and signature lines
- Invoice data stays in the browser; no backend or database required

## Calculation convention
This version treats **CPU as the invoice unit price**: `CPU = MRP × (100 − GP%) ÷ 100`. `Amount = Quantity × CPU`. The GP column is treated as a discount percentage; the summary shows the total discount value in taka. Delivery charge is added to the subtotal to calculate the invoice total. Confirm this convention matches your accounting practice before using it for live billing.

## Run locally
1. Install Node.js 18 or newer.
2. Run `npm install`.
3. Run `npm run dev` and open the local URL shown in the terminal.
4. Run `npm run build` to create the production build in `dist/`.

## Deploy to Vercel
1. Upload this project to a GitHub repository.
2. In Vercel, choose **Add New → Project** and import the repository.
3. Framework preset: **Vite**. Build command: `npm run build`. Output directory: `dist`.
4. Deploy. No environment variables are required.

The included `vercel.json` supports the SPA route fallback.
