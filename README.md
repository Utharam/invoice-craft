# InvoiceCraft ⚡ `v1.1.0`
> **A Plug-and-Play, Local-First, Browser-Based Invoice Generator**
> Built with 100% Client-Side Web Standards, IndexedDB Storage, 10 Curated Visual Models, Multi-Leg Tax Engine, and a Multi-Mode Logo Studio.

---

## 🌟 Key Highlights

1. **100% Client-Side & Privacy-First (IndexedDB)**:
   * Zero cloud servers, zero tracking, zero subscription fees.
   * All company details, clients, past invoices, and high-res logos are stored securely inside your browser's **IndexedDB**.
   * Completely offline-ready.
   * Includes one-click **JSON Backup & Restore**.

2. **Bundle of 10 Distinct Design Models**:
   Switch templates instantly without losing any entered data:
   * **Modern Swiss** *(Default)*: Clean asymmetric grid, razor-thin dividers, sans-serif balance.
   * **Minimalist Mono**: Monospaced typography (`JetBrains Mono`), typewriter dashed lines, terminal/dev feel.
   * **Executive Corporate**: Solid accent header banner with structured zebra-striped tables.
   * **Editorial Serif**: High-fashion serif headings (`Playfair Display`), delicate double hair-lines, luxury aesthetic.
   * **Bold Accent**: Vibrant left accent pillar, high-contrast badges and total callouts.
   * **Tech Slate**: Dark charcoal header with cyber cyan status badges and telemetry layout.
   * **Neobrutalist**: 3px solid black outlines, hard offset drop shadows (`4px 4px 0 #000`), retro chips.
   * **Compact Thermal**: Space-saving receipt-style invoice with dashed tear-off edges.
   * **Warm Studio**: Earthy terracotta and sand tones with gentle rounded cards.
   * **Bento Grid**: Modern modular card compartments for parties, dates, line items, and totals.

3. **Multi-Leg Tax Setup Engine**:
   * Add any number of tax legs (e.g. `CGST (9%)` + `SGST (9%)`, `US State Sales Tax (6.25%)` + `County Tax (2%)`, `Canadian GST (5%)` + `PST (7%)`, or `EU VAT (20%)`).
   * **Compound Tax Toggle**: Option to calculate a tax leg on top of `Subtotal + Prior Taxes` (tax-on-tax).
   * **Instant Presets**: One-click dropdown to configure common international tax regimes.
   * Itemized breakdown displayed clearly in the summary.

4. **Integrated Logo Studio (4 Modes)**:
   * **Mode 1: Upload Existing File**: Upload `.jpg`, `.jpeg`, `.png`, `.webp`, or `.svg`. Automatically resized via HTML5 `<canvas>` to ensure high-DPI print sharpness without bloating local database storage.
   * **Mode 2: Vector Monogram Generator**: Type company initials (e.g., `AC`), select a badge shape (*Squircle, Circle, Hexagon, Shield, Diamond, Rounded Square*), pick background and letter colors.
   * **Mode 3: Open Asset Icons (40+)**: A curated catalog of clean open-source business vector icons categorized into *Tech & Dev, Finance & Tax, Legal & Consulting, Design & Media, Trades & Home, Retail & Logistics, and Geometric Badges*.
   * **Mode 4: AI Logo Prompt Builder & Free Generator**:
     * Generates a tailored, copy-pasteable prompt for ChatGPT, Midjourney, or Gemini.
     * Includes a free 1-click generation preview option using the open Pollinations API.

5. **Curated Typography & Color Styling**:
   * 9 Google Fonts: `Inter`, `Space Grotesk`, `Playfair Display`, `JetBrains Mono`, `Outfit`, `Plus Jakarta Sans`, `Syne`, `Cinzel`, `DM Sans`.
   * Real-time brand accent color picker + 8 instant color presets.
   * Logo scaling slider (60px to 240px) and alignment toggles (Left, Center, Right).

6. **Pixel-Perfect Vector PDF Generation**:
   * Uses browser native vector rendering via `window.print()` with a dedicated `@media print` and `@page { size: A4 portrait; margin: 0mm; }` stylesheet.
   * 100% razor-sharp vector text, selectable text, zero browser header/footer marks (no IP or timestamp URLs), and automatic multi-page repeating table headers.

7. **Global & Middle Eastern Currencies + Custom Currency**:
   * Pre-configured presets for **USD ($)**, **EUR (€)**, **GBP (£)**, **INR (₹)**, **CAD (C$)**, **AUD (A$)**, **JPY (¥)**, **CHF**, plus major Middle Eastern currencies: **BHD** (Bahraini Dinar), **SAR** (Saudi Riyal), **AED** (UAE Dirham), **QAR** (Qatari Riyal), **KWD** (Kuwaiti Dinar), and **OMR** (Omani Rial).
   * **Custom Currency Input**: Type any symbol or ISO code (e.g. `SGD`, `NZD`, `ZAR`) with automated words conversion.

8. **Dual Number Formatting & Legal Amount in Words Engine**:
   * Seamlessly switch between **Indian Format** (`12,34,567.89` with Lakhs/Crores and Rupees/Paise words) and **International Standard** (`1,234,567.89` with Millions/Billions and Dollars/Cents words).
   * Exact grammatical words dictionary for Middle Eastern currencies (*Dinars/Fils*, *Riyals/Halalas*, *Dirhams/Fils*, *Rials/Baisa*).
   * Sub-cent rounding overflow protection.

9. **Live A4 Page Fit Engine & Smart Guides**:
   * Real-time document geometry engine with an on-canvas status badge (`A4: 1 Page` / `A4: X Pages`).
   * Visual page boundary guides indicate exact page transitions during editing, while automatically staying hidden during PDF export.

10. **Previous Invoices History & Client Vault**:
    * **Previous Invoices Modal**: Real-time keyword search, document type filter chips (`All`, `Invoices`, `Quotes`, `Estimates`, `Proformas`), and filter by client dropdown.
    * **Client Directory with Billing History**: View past documents and total revenue per client with expandable history drawers, 1-click document reloading, and 1-click new document drafting.
    * **Graceful New Document Prompt**: Protects against accidental data loss with *Save & Start Fresh*, *Discard*, and *Cancel* options.

---

## 📖 User Guide & How-To Manual

### 1. Document History & Previous Invoices
Every invoice, quote, and estimate you save is stored safely in your browser's local **IndexedDB** database.
* **Accessing History**: Click the **Previous Invoices** button in the top navigation bar.
* **Instant Full-Text Search**: Type into the search input to filter documents in real time. The search indexes:
  * **Document Number** (e.g. `INV-2026-0042`)
  * **Client Name** (e.g. `Acme Corp`)
  * **Line-Item Descriptions** (e.g. typing `consulting`, `hosting`, or `license` will instantly reveal any past invoice containing that item).
* **Document Type Filter Chips**: Click **All**, **Invoices**, **Quotes**, **Estimates**, or **Proformas** to quickly view documents by type with live counter badges.
* **Client Filter Dropdown**: Select a client to isolate and review all documents issued to them.
* **Actions per Document**:
  * **Load**: Restores the document onto the live editor canvas for editing or re-exporting.
  * **Duplicate**: Clones all items, client details, and tax settings into a fresh draft with a newly incremented continuous invoice number.
  * **Delete**: Safely removes the record from your local IndexedDB storage.

---

### 2. Global, Middle Eastern & Custom Currencies
InvoiceCraft features a versatile multi-currency engine configured in **Module 3 (Invoice Details)** in the left sidebar:
* **Global Presets**: Instant selection for **USD ($)**, **EUR (€)**, **GBP (£)**, **INR (₹)**, **CAD (C$)**, **AUD (A$)**, **JPY (¥)**, and **CHF**.
* **Middle Eastern Presets**: Pre-configured with authentic symbol notation, localized formatting, and official fractional subunits:
  * **BHD (Bahraini Dinar)**: `BD` / `د.ب` with **3 decimal places** and *Fils* fractional units.
  * **SAR (Saudi Riyal)**: `SR` / `ر.س` with *Halalas*.
  * **AED (UAE Dirham)**: `AED` / `د.إ` with *Fils*.
  * **QAR (Qatari Riyal)**: `QR` / `ر.ق` with *Dirhams*.
  * **KWD (Kuwaiti Dinar)**: `KD` / `د.ك` with **3 decimal places** and *Fils*.
  * **OMR (Omani Rial)**: `RO` / `ر.ع` with **3 decimal places** and *Baisa*.
* **Custom Currency Input**:
  1. Select **"Custom Currency..."** at the bottom of the currency dropdown.
  2. Enter any ISO currency code or symbol (e.g., `SGD`, `NZD`, `ZAR`, `kr`, `₱`, `₫`).
  3. The app dynamically applies your custom symbol across all line-item tables, subtotal breakdowns, and summaries.
* **Automated Legal Amount in Words**:
  * Automatically spells out the final payable total in grammatically accurate legal words format (e.g., *"Bahraini Dinars and Five Hundred Fils Only"*, *"Saudi Riyals and Fifty Halalas Only"*, *"US Dollars and Seventy-Five Cents Only"*).

---

### 3. Client Directory & Invoices Under Clients
Manage client relationships and trace billing history without leaving the app:
* **Opening the Client Directory**: Click **Clients** in the top navigation bar.
* **Address Book**: Stores client names, company details, email addresses, phone numbers, billing addresses, and Tax IDs / VAT numbers.
* **Lifetime Billed Revenue Badge**: Every client card automatically computes and displays cumulative revenue and document count (e.g., `Billed: $14,250.00 • 3 docs`).
* **Expandable Invoices Drawer**:
  * Click **"View Invoices (N)"** on any client card to unfold a collapsible drawer listing all invoices, quotes, and estimates issued to that client.
  * Click **Load** on any invoice in the drawer to open it directly into the editor.
* **1-Click "+ New Doc" for Client**:
  * Click the **"+ New Doc"** button on any client card to immediately start a fresh invoice with that client's contact, address, and tax information pre-populated.

---

### 4. Document Protection & "New Document" Flow
InvoiceCraft prevents accidental work loss when starting new documents:
* When you click **+ New** in the top navigation bar while having an active draft with items or client details, a safety confirmation dialog appears:
  * **Save & Start Fresh**: Automatically saves your current document to IndexedDB, advances your continuous sequential invoice counter, and opens a clean canvas.
  * **Discard & Start Fresh**: Clears the canvas immediately without saving.
  * **Cancel / Keep Editing**: Dismisses the dialog and keeps your current editing session intact.

---

### 5. Continuous Numbering Engine & Taxes
* **Sequential Numbering**: Click the **Numbering Engine** button next to Invoice # to configure continuous sequential patterns (e.g., `{PREFIX}/{FY}/{COUNTER}`), custom prefix/suffix, padding length, starting counter offsets (e.g., resume from 576), and year rollover rules. Click **Next Seq #** anytime for a single-click sequence bump.
* **Multi-Leg Taxes**: Add itemized tax legs (e.g., `CGST 9%` + `SGST 9%`, or State Sales Tax + County Tax) with an optional **Compound Tax Toggle** for calculating tax-on-tax.

---

### 6. Pixel-Perfect Vector PDF Export
* Click **Print / Save PDF** (or press `Ctrl+P`).
* Set destination to **Save as PDF**.
* Guaranteed clean **1-page fit** (or seamless multi-page table repetition), crisp selectable vector text, and zero browser headers or footer URLs.

---

## 🚀 How to Run

### Method 1: Instant Double-Click (Zero Setup)
Simply double-click `start.bat` or open `index.html` directly in any web browser (Google Chrome, Microsoft Edge, Brave, Firefox, Safari).

### Method 2: Via Local Web Server
If you prefer running through Node or Python:
```bash
# Using npm
npm start

# Or using Python
python -m http.server 3000
```
Then visit `http://localhost:3000` in your browser.

---

## 📁 Project Structure

```
d:\invoice generator\
├── index.html         # Main semantic application layout & native dialog modals
├── css/
│   └── styles.css     # CSS custom properties, 10 template themes, and print stylesheet
├── js/
│   ├── app.js         # Core application logic, event handlers, tax calculator
│   ├── db.js          # IndexedDB wrapper for invoices, clients, and drafts
│   ├── icons.js       # Curated 40+ SVG icons & vector monogram generator
│   └── bundle.js      # Standalone zero-CORS bundle for double-click offline execution
├── build.js           # Lightweight bundling script
├── package.json       # Node package configuration
├── start.bat          # 1-click Windows launcher
└── README.md          # Documentation
```

---

## 📄 License
MIT License. Free to use, adapt, and distribute for personal or commercial projects.
