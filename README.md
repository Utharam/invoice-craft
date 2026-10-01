# InvoiceCraft ⚡
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
