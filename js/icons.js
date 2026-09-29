/**
 * Curated Open SVG Business Icons & Brand Lockup Generator
 * Supports 40+ vector icons across 7 industries and comprehensive Brand Lockups
 * (Icon/Monogram + Company Wordmark + Subtitle Tagline + Decorative Underlines).
 */

export const ICON_CATEGORIES = [
  { id: 'tech', label: 'Tech & Dev' },
  { id: 'finance', label: 'Finance & Tax' },
  { id: 'legal', label: 'Legal & Consulting' },
  { id: 'creative', label: 'Design & Media' },
  { id: 'trades', label: 'Trades & Home' },
  { id: 'retail', label: 'Retail & Logistics' },
  { id: 'abstract', label: 'Geometric Badges' }
];

export const ICONS = [
  // Tech & Dev
  {
    id: 'terminal',
    category: 'tech',
    name: 'Terminal Console',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>`
  },
  {
    id: 'code',
    category: 'tech',
    name: 'Code Brackets',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`
  },
  {
    id: 'cpu',
    category: 'tech',
    name: 'Microchip CPU',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="14" x2="23" y2="14"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="14" x2="4" y2="14"></line></svg>`
  },
  {
    id: 'cloud',
    category: 'tech',
    name: 'Cloud Infrastructure',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path></svg>`
  },
  {
    id: 'database',
    category: 'tech',
    name: 'Database Storage',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>`
  },
  {
    id: 'zap',
    category: 'tech',
    name: 'Lightning Fast',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`
  },

  // Finance & Tax
  {
    id: 'briefcase',
    category: 'finance',
    name: 'Executive Briefcase',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>`
  },
  {
    id: 'chart-trending',
    category: 'finance',
    name: 'Growth Analytics',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>`
  },
  {
    id: 'receipt',
    category: 'finance',
    name: 'Ledger Receipt',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z"></path><line x1="8" y1="8" x2="16" y2="8"></line><line x1="8" y1="12" x2="16" y2="12"></line><line x1="8" y1="16" x2="12" y2="16"></line></svg>`
  },
  {
    id: 'vault',
    category: 'finance',
    name: 'Safe Vault',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="12" cy="12" r="3"></circle><line x1="12" y1="9" x2="12" y2="7"></line><line x1="15" y1="12" x2="17" y2="12"></line><line x1="12" y1="15" x2="12" y2="17"></line><line x1="9" y1="12" x2="7" y2="12"></line></svg>`
  },
  {
    id: 'credit-card',
    category: 'finance',
    name: 'Payment Card',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>`
  },

  // Legal & Consulting
  {
    id: 'scale',
    category: 'legal',
    name: 'Scales of Justice',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path><path d="M7 21h10"></path><path d="M12 3v18"></path><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"></path></svg>`
  },
  {
    id: 'shield-check',
    category: 'legal',
    name: 'Security Shield',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><polyline points="9 12 11 14 15 10"></polyline></svg>`
  },
  {
    id: 'landmark',
    category: 'legal',
    name: 'Institution Pillars',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="21" x2="21" y2="21"></line><line x1="6" y1="18" x2="6" y2="11"></line><line x1="10" y1="18" x2="10" y2="11"></line><line x1="14" y1="18" x2="14" y2="11"></line><line x1="18" y1="18" x2="18" y2="11"></line><polygon points="12 2 20 7 4 7 12 2"></polygon></svg>`
  },
  {
    id: 'award',
    category: 'legal',
    name: 'Quality Award',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"></circle><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline></svg>`
  },

  // Creative & Media
  {
    id: 'pen-tool',
    category: 'creative',
    name: 'Vector Pen Tool',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19 7-7 3 3-7 7-3-3z"></path><path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="m2 2 7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle></svg>`
  },
  {
    id: 'palette',
    category: 'creative',
    name: 'Design Palette',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5"></circle><circle cx="17.5" cy="10.5" r=".5"></circle><circle cx="8.5" cy="7.5" r=".5"></circle><circle cx="6.5" cy="12.5" r=".5"></circle><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"></path></svg>`
  },
  {
    id: 'camera',
    category: 'creative',
    name: 'Studio Camera',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>`
  },
  {
    id: 'layers',
    category: 'creative',
    name: 'Modular Layers',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>`
  },
  {
    id: 'feather',
    category: 'creative',
    name: 'Editorial Quill',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"></path><line x1="16" y1="8" x2="2" y2="22"></line><line x1="17.5" y1="15" x2="9" y2="15"></line></svg>`
  },

  // Trades & Home
  {
    id: 'hammer',
    category: 'trades',
    name: 'Craftsman Hammer',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 12-8.5 8.5c-.83.83-2.17.83-3 0 0 0 0 0 0 0a2.12 2.12 0 0 1 0-3L12 9"></path><path d="M17.64 15 22 10.64"></path><path d="m20.91 3.26-6.5 6.5"></path><path d="m14.56 2.05 4.3 4.3"></path><path d="m4.93 4.93 4.24 4.24"></path></svg>`
  },
  {
    id: 'wrench',
    category: 'trades',
    name: 'Mechanic Wrench',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>`
  },
  {
    id: 'home',
    category: 'trades',
    name: 'Architect Home',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`
  },
  {
    id: 'compass',
    category: 'trades',
    name: 'Drafting Compass',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon></svg>`
  },

  // Retail & Logistics
  {
    id: 'shopping-bag',
    category: 'retail',
    name: 'Boutique Bag',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>`
  },
  {
    id: 'package',
    category: 'retail',
    name: 'Parcel Delivery',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"></line><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>`
  },
  {
    id: 'truck',
    category: 'retail',
    name: 'Freight Logistics',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>`
  },
  {
    id: 'globe',
    category: 'retail',
    name: 'Global Enterprise',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`
  },

  // Abstract & Badges
  {
    id: 'hexagon',
    category: 'abstract',
    name: 'Hexagon Apex',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>`
  },
  {
    id: 'infinity',
    category: 'abstract',
    name: 'Infinity Loop',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.178 8c5.096 0 5.096 8 0 8-2.617 0-4.636-2.073-6.178-4-1.542-1.927-3.561-4-6.178-4-5.096 0-5.096 8 0 8 2.617 0 4.636-2.073 6.178-4 1.542-1.927 3.561-4 6.178-4z"></path></svg>`
  },
  {
    id: 'target',
    category: 'abstract',
    name: 'Precision Target',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>`
  },
  {
    id: 'sparkles',
    category: 'abstract',
    name: 'Modern Sparkle',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path></svg>`
  }
];

/**
 * Estimate visual text width in pixels
 */
export function estimateTextWidth(text, fontSize, isUppercase = false, letterSpacing = 0) {
  if (!text) return 0;
  const str = isUppercase ? text.toUpperCase() : text;
  let total = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if ('ilI|:;.!\''.includes(ch)) total += fontSize * 0.28;
    else if ('mwMW_@#%'.includes(ch)) total += fontSize * 0.88;
    else if (ch === ' ') total += fontSize * 0.32;
    else if (ch >= 'A' && ch <= 'Z') total += fontSize * 0.68;
    else total += fontSize * 0.58;
  }
  total += Math.max(0, str.length - 1) * letterSpacing;
  return Math.round(total);
}

/**
 * Generate a standalone SVG element for a symbol (Monogram or Icon)
 */
function renderSymbolSVG(symbolType, initials, shape, iconId, markColor, bgColor, emblemStyle = 'solid') {
  markColor = markColor || '#2563eb';
  bgColor = bgColor || 'transparent';

  if (symbolType === 'icon') {
    const icon = ICONS.find(i => i.id === iconId) || ICONS[0];
    let bgShape = '';
    const shapeFill = bgColor !== 'transparent' ? bgColor : markColor;
    let fillAttr = `fill="${shapeFill}"`;
    let strokeAttr = '';
    if (emblemStyle === 'outline') {
      fillAttr = 'fill="transparent"';
      strokeAttr = `stroke="${shapeFill}" stroke-width="2.5"`;
    } else if (emblemStyle === 'soft') {
      fillAttr = `fill="${shapeFill}" fill-opacity="0.14"`;
    }

    if (shape === 'circle') bgShape = `<circle cx="28" cy="28" r="26" ${fillAttr} ${strokeAttr} />`;
    else if (shape === 'squircle') bgShape = `<rect x="3" y="3" width="50" height="50" rx="14" ${fillAttr} ${strokeAttr} />`;
    else if (shape === 'square') bgShape = `<rect x="3" y="3" width="50" height="50" rx="8" ${fillAttr} ${strokeAttr} />`;

    const iconColor = (emblemStyle === 'outline' || emblemStyle === 'soft') ? shapeFill : markColor;
    const iconInner = icon.svg
      .replace('stroke="currentColor"', `stroke="${iconColor}"`)
      .replace(/viewBox="[^"]*"/, 'viewBox="0 0 24 24" x="12" y="12" width="32" height="32"');

    return `<g>${bgShape}${iconInner}</g>`;
  }

  // Monogram Symbol
  const cleanInitials = escapeXml((initials || 'AB').substring(0, 3).toUpperCase());
  const fillCol = bgColor !== 'transparent' ? bgColor : markColor;
  let fillAttr = `fill="${fillCol}"`;
  let strokeAttr = '';
  let letterColor = '#ffffff';

  if (emblemStyle === 'outline') {
    fillAttr = 'fill="transparent"';
    strokeAttr = `stroke="${fillCol}" stroke-width="2.5"`;
    letterColor = fillCol;
  } else if (emblemStyle === 'soft') {
    fillAttr = `fill="${fillCol}" fill-opacity="0.14"`;
    letterColor = fillCol;
  } else {
    letterColor = (bgColor !== 'transparent' && markColor === '#ffffff') ? '#ffffff' : (bgColor !== 'transparent' ? markColor : '#ffffff');
  }

  let shapePath = '';
  if (shape === 'circle') shapePath = `<circle cx="28" cy="28" r="26" ${fillAttr} ${strokeAttr} />`;
  else if (shape === 'squircle') shapePath = `<rect x="3" y="3" width="50" height="50" rx="14" ${fillAttr} ${strokeAttr} />`;
  else if (shape === 'shield') shapePath = `<path d="M28 3 L50 12 L50 31 C50 42 28 53 28 53 C28 53 6 42 6 31 L6 12 Z" ${fillAttr} ${strokeAttr} />`;
  else if (shape === 'hexagon') shapePath = `<polygon points="28,3 51,15 51,41 28,53 5,41 5,15" ${fillAttr} ${strokeAttr} />`;
  else if (shape === 'diamond') shapePath = `<polygon points="28,3 53,28 28,53 3,28" ${fillAttr} ${strokeAttr} />`;
  else shapePath = `<rect x="3" y="3" width="50" height="50" rx="8" ${fillAttr} ${strokeAttr} />`;

  const fontSize = cleanInitials.length > 2 ? 16 : 20;

  return `
    <g>
      ${shapePath}
      <text x="28" y="34" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="${fontSize}" font-weight="800" fill="${letterColor}" text-anchor="middle" dominant-baseline="middle" letter-spacing="0.5">${cleanInitials}</text>
    </g>
  `;
}

/**
 * Universal XML & SVG Safe Data URI Helpers
 */
export function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function svgToDataURI(svgString) {
  try {
    if (typeof btoa === 'function') {
      return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString)));
    }
  } catch (err) {
    console.warn('btoa encoding error, falling back:', err);
  }
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
}

/**
 * Generate Decorative Underline Markups
 */
function renderUnderlineSVG(style, x1, y, width, accentColor) {
  const x2 = x1 + width;
  accentColor = accentColor || '#2563eb';

  if (style === 'solid') {
    return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" />`;
  }
  if (style === 'dashed') {
    return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${accentColor}" stroke-width="2.5" stroke-dasharray="6,4" stroke-linecap="round" />`;
  }
  if (style === 'accent-pip') {
    return `
      <line x1="${x1}" y1="${y}" x2="${Math.max(x1 + 10, x2 - 8)}" y2="${y}" stroke="${accentColor}" stroke-width="2" stroke-linecap="round" />
      <circle cx="${x2}" cy="${y}" r="3" fill="${accentColor}" />
    `;
  }
  if (style === 'gradient') {
    const gradId = 'brandGrad_' + Math.abs(Math.round(x1 + y + width));
    return `
      <defs>
        <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="${accentColor}" stop-opacity="1" />
          <stop offset="65%" stop-color="${accentColor}" stop-opacity="0.8" />
          <stop offset="100%" stop-color="${accentColor}" stop-opacity="0" />
        </linearGradient>
      </defs>
      <line x1="${x1}" y1="${y}" x2="${x2 + 15}" y2="${y}" stroke="url(#${gradId})" stroke-width="3" stroke-linecap="round" />
    `;
  }
  if (style === 'double') {
    return `
      <line x1="${x1}" y1="${y - 2}" x2="${x2}" y2="${y - 2}" stroke="${accentColor}" stroke-width="1.5" />
      <line x1="${x1}" y1="${y + 2}" x2="${x2}" y2="${y + 2}" stroke="${accentColor}" stroke-width="1.5" />
    `;
  }
  if (style === 'dots') {
    const dotsCount = Math.max(3, Math.floor(width / 12));
    let dots = '';
    for (let i = 0; i < dotsCount; i++) {
      dots += `<circle cx="${x1 + i * 12 + 3}" cy="${y}" r="2" fill="${accentColor}" />`;
    }
    return dots;
  }
  if (style === 'offset-shadow') {
    return `
      <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="#0f172a" stroke-width="3" />
      <line x1="${x1 + 3}" y1="${y + 3}" x2="${x2 + 3}" y2="${y + 3}" stroke="${accentColor}" stroke-width="2" />
    `;
  }
  return ''; // none
}

/**
 * Complete Brand Lockup SVG Generator
 * Combines Symbol (Monogram or Icon) + Wordmark + Tagline + Underline
 */
export function generateBrandLockupSVG({
  symbolType = 'monogram', // 'monogram' or 'icon'
  initials = 'AD',
  shape = 'squircle',
  emblemStyle = 'solid',   // 'solid', 'outline', 'soft'
  iconId = 'terminal',
  markColor = '#2563eb',
  bgColor = '#2563eb',
  companyName = 'Apex Studio',
  tagline = 'Design & Technology',
  underlineStyle = 'solid',    // 'none', 'solid', 'dashed', 'accent-pip', 'gradient', 'double', 'dots', 'offset-shadow'
  underlineSpan = 'auto',      // 'auto', 'title', 'short', 'extended', 'custom'
  underlineWidth = 0,          // manual pixel length if > 0
  underlinePosition = 'bottom',// 'bottom' (below tagline) or 'middle' (between title & tagline)
  layout = 'horizontal',       // 'horizontal' or 'stacked'
  textColor = '#0f172a',
  accentColor = '#2563eb'
}) {
  const sanitizedName = escapeXml(companyName || '');
  const sanitizedTag = escapeXml((tagline || '').toUpperCase());

  const symbolSVG = renderSymbolSVG(symbolType, initials, shape, iconId, markColor, bgColor, emblemStyle);

  const titleWidth = estimateTextWidth(sanitizedName, 20, false, -0.4);
  const tagWidth = sanitizedTag ? estimateTextWidth(sanitizedTag, 9, true, 1.5) : 0;
  const maxTextWidth = Math.max(titleWidth, tagWidth);

  // Compute underline length accurately matching user choice or subtext
  let lineW = Math.max(40, maxTextWidth);
  if (underlineWidth && parseInt(underlineWidth, 10) > 0) {
    lineW = parseInt(underlineWidth, 10);
  } else if (underlineSpan === 'title') {
    lineW = Math.max(30, titleWidth);
  } else if (underlineSpan === 'short') {
    lineW = 45;
  } else if (underlineSpan === 'extended') {
    lineW = maxTextWidth + 35;
  } else {
    // 'auto': exactly spans the longer of wordmark or subtitle
    lineW = Math.max(40, maxTextWidth);
  }

  if (layout === 'stacked') {
    const width = Math.max(300, Math.round(Math.max(maxTextWidth, lineW) + 60));
    const height = 120;
    const centerX = width / 2;
    const symbolX = centerX - 28;

    let yTitle = 76;
    let yTag = 94;
    let yUnderline = 104;

    if (underlinePosition === 'middle' && sanitizedTag) {
      yTitle = 72;
      yUnderline = 82;
      yTag = 96;
    }

    const startX = centerX - Math.round(lineW / 2);
    const underlineMarkup = renderUnderlineSVG(underlineStyle, startX, yUnderline, lineW, accentColor);

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
      <g transform="translate(${symbolX}, 6)">${symbolSVG}</g>
      <text x="${centerX}" y="${yTitle}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="800" fill="${textColor}" text-anchor="middle" letter-spacing="-0.3">${sanitizedName}</text>
      ${sanitizedTag ? `<text x="${centerX}" y="${yTag}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="8.5" font-weight="600" fill="#64748b" text-anchor="middle" letter-spacing="1.8">${sanitizedTag}</text>` : ''}
      ${underlineMarkup}
    </svg>`;

    return svgToDataURI(svg);
  }

  // Default: Horizontal Lockup
  let yTitle = 34;
  let yTag = 50;
  let yUnderline = 62;
  let svgHeight = 74;

  if (underlinePosition === 'middle' && sanitizedTag) {
    yTitle = 28;
    yUnderline = 38;
    yTag = 54;
    svgHeight = 74;
  } else if (!sanitizedTag) {
    yTitle = 33;
    yUnderline = 46;
    svgHeight = 64;
  }

  const startX = 74;
  const underlineMarkup = renderUnderlineSVG(underlineStyle, startX, yUnderline, lineW, accentColor);
  const totalContentWidth = startX + Math.max(maxTextWidth, lineW) + 20;
  const width = Math.max(280, Math.min(560, Math.round(totalContentWidth)));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${svgHeight}" width="${width}" height="${svgHeight}">
    <g transform="translate(6, 8)">${symbolSVG}</g>
    <text x="74" y="${yTitle}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="800" fill="${textColor}" letter-spacing="-0.4">${sanitizedName}</text>
    ${sanitizedTag ? `<text x="74" y="${yTag}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="9" font-weight="600" fill="#64748b" letter-spacing="1.5">${sanitizedTag}</text>` : ''}
    ${underlineMarkup}
  </svg>`;

  return svgToDataURI(svg);
}

/**
 * Backward compatibility helpers
 */
export function generateMonogramSVG(initials, shape, bgColor, textColor) {
  return generateBrandLockupSVG({
    symbolType: 'monogram',
    initials,
    shape,
    markColor: textColor,
    bgColor,
    companyName: '',
    tagline: '',
    underlineStyle: 'none',
    layout: 'horizontal'
  });
}

export function generateIconDataURI(iconId, color = '#2563eb', bgColor = 'transparent', shape = 'none') {
  return generateBrandLockupSVG({
    symbolType: 'icon',
    iconId,
    shape,
    markColor: color,
    bgColor,
    companyName: '',
    tagline: '',
    underlineStyle: 'none',
    layout: 'horizontal'
  });
}
