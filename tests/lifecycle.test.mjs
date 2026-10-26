/**
 * Stream A — lifecycle module tests (conversion + duplicate record builders).
 * Interface under test: ../js/lifecycle.js
 *   buildConversionRecords({ source, invoiceId, invoiceNumber, now, company })
 *   buildDuplicateRecord({ source, id, number, now })
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildConversionRecords,
  buildDuplicateRecord
} from '../js/lifecycle.js';

function makeQuotation(overrides = {}) {
  return Object.assign({
    id: 'inv_q1',
    template: 'executive-corporate',
    font: "'Serif', serif",
    accentColor: '#8b5e3c',
    logo: { dataUri: 'data:image/png;base64,AAA', width: 120, align: 'left', layout: 'center' },
    meta: {
      docType: 'quotation',
      title: 'QUOTATION',
      number: 'QT/2026-27/0253',
      date: '2026-09-12',
      dueDate: '2026-10-12',
      currency: '₹',
      numberFormat: 'indian',
      showAmountInWords: true,
      showSignature: true,
      status: 'sent',
      po: 'Ref: QT/2026-27/0253'
    },
    sender: { name: 'Apex Design', email: 'a@apex.io', phone: '555', address: '100 Way', taxId: 'GSTIN-1' },
    client: { name: 'Starlight', email: 's@starlight.io', phone: '987', address: '742 Terrace', taxId: 'VAT-2' },
    items: [
      { id: 'item_1', description: 'Design', hsn: '998314', qty: 2, rate: 50, discount: 0, taxRate: 18 }
    ],
    taxes: [{ id: 'tax_1', name: 'CGST', ratio: 50 }, { id: 'tax_2', name: 'SGST', ratio: 50 }],
    payment: 'UPI apex@upi',
    notes: 'Quotation terms.'
  }, overrides);
}

const NOW = new Date(2026, 9, 26, 12, 0, 0, 0); // 2026-10-26 local noon

// ---------------------------------------------------------------------------
// buildConversionRecords
// ---------------------------------------------------------------------------
test('conversion builds a new invoice record with durable source links', () => {
  const source = makeQuotation();
  const { invoice } = buildConversionRecords({
    source,
    invoiceId: 'inv_new1',
    invoiceNumber: 'INV/2026-27/0230',
    now: NOW
  });

  assert.equal(invoice.id, 'inv_new1');
  assert.equal(invoice.meta.docType, 'invoice');
  assert.equal(invoice.meta.number, 'INV/2026-27/0230');
  assert.equal(invoice.sourceDocId, 'inv_q1');
  assert.equal(invoice.sourceDocNumber, 'QT/2026-27/0253');
  // The new record must not carry the source's conversion fields forward.
  assert.ok(!('convertedToId' in invoice));
  assert.ok(!('convertedAt' in invoice));
});

test('conversion resets dates: issue today, due +14 days, status pending', () => {
  const source = makeQuotation();
  const { invoice } = buildConversionRecords({
    source, invoiceId: 'inv_new2', invoiceNumber: 'INV/2026-27/0231', now: NOW
  });

  assert.equal(invoice.meta.date, '2026-10-26');
  assert.equal(invoice.meta.dueDate, '2026-11-09'); // +14 days
  assert.equal(invoice.issueDate, '2026-10-26');
  assert.equal(invoice.dueDate, '2026-11-09');
  assert.equal(invoice.meta.status, 'pending');
  assert.equal(invoice.status, 'pending');
});

test('conversion preserves currency, format, brand, content and signature is cleared', () => {
  const source = makeQuotation();
  const { invoice } = buildConversionRecords({
    source, invoiceId: 'inv_new3', invoiceNumber: 'INV/2026-27/0232', now: NOW
  });

  // Currency + number format carried over untouched.
  assert.equal(invoice.meta.currency, '₹');
  assert.equal(invoice.meta.numberFormat, 'indian');
  // Layout/content preserved.
  assert.equal(invoice.template, 'executive-corporate');
  assert.equal(invoice.accentColor, '#8b5e3c');
  assert.deepStrictEqual(invoice.logo, source.logo);
  assert.deepStrictEqual(invoice.items, source.items);
  assert.deepStrictEqual(invoice.taxes, source.taxes);
  assert.deepStrictEqual(invoice.client, source.client);
  assert.equal(invoice.payment, 'UPI apex@upi');
  assert.equal(invoice.notes, 'Quotation terms.');
  assert.equal(invoice.meta.showAmountInWords, true);
  // Signature cleared on the invoice.
  assert.equal(invoice.meta.showSignature, false);
});

test('conversion records the source update without overwriting its content', () => {
  const source = makeQuotation();
  const { sourceUpdate } = buildConversionRecords({
    source, invoiceId: 'inv_new4', invoiceNumber: 'INV/2026-27/0233', now: NOW
  });

  assert.equal(sourceUpdate.convertedToId, 'inv_new4');
  assert.equal(sourceUpdate.convertedToNumber, 'INV/2026-27/0233');
  assert.equal(typeof sourceUpdate.convertedAt, 'string');
  assert.equal(new Date(sourceUpdate.convertedAt).getTime(), NOW.getTime());
  // Financial fields and content untouched on the source update.
  assert.deepStrictEqual(sourceUpdate.items, source.items);
  assert.deepStrictEqual(sourceUpdate.client, source.client);
  assert.equal(sourceUpdate.meta.number, 'QT/2026-27/0253');
  assert.equal(sourceUpdate.meta.status, 'accepted'); // was 'sent'
});

test('source status becomes accepted only from draft/sent states', () => {
  for (const from of ['draft', 'sent']) {
    const source = makeQuotation({ meta: makeQuotation().meta, id: 'inv_d_' + from });
    source.meta.status = from;
    const { sourceUpdate } = buildConversionRecords({ source, invoiceId: 'inv_' + from, invoiceNumber: 'N1', now: NOW });
    assert.equal(sourceUpdate.meta.status, 'accepted');
    assert.equal(sourceUpdate.status, 'accepted');
  }

  for (const from of ['accepted', 'declined', 'expired']) {
    const source = makeQuotation({ id: 'inv_p_' + from });
    source.meta.status = from;
    const { sourceUpdate } = buildConversionRecords({ source, invoiceId: 'inv_x' + from, invoiceNumber: 'N2', now: NOW });
    assert.equal(sourceUpdate.meta.status, from);
  }
});

test('conversion is pure: the source record object is never mutated', () => {
  const source = makeQuotation();
  const before = JSON.stringify(source);
  buildConversionRecords({ source, invoiceId: 'inv_pure', invoiceNumber: 'INV/2026-27/0234', now: NOW });
  assert.equal(JSON.stringify(source), before);
});

test('conversion links the current company when provided', () => {
  const source = makeQuotation();
  const company = { id: 'comp_prod', name: 'Apex Production', email: 'p@apex.io', phone: '777', address: '22 Street', taxId: 'EIN-9' };
  const { invoice, sourceUpdate } = buildConversionRecords({
    source, invoiceId: 'inv_comp', invoiceNumber: 'INV/2026-27/0235', now: NOW, company
  });
  assert.equal(invoice.companyId, 'comp_prod');
  assert.equal(invoice.sender.name, 'Apex Production');
  // The source keeps its own sender snapshot.
  assert.equal(sourceUpdate.sender.name, 'Apex Design');
});

test('conversion refuses a source that is already converted', () => {
  const source = makeQuotation({ convertedToId: 'inv_already' });
  assert.throws(() => buildConversionRecords({
    source, invoiceId: 'inv_no', invoiceNumber: 'INV/2026-27/0236', now: NOW
  }), /already/i);
});

test('conversion requires an id and a number', () => {
  const source = makeQuotation();
  assert.throws(() => buildConversionRecords({ source, invoiceId: '', invoiceNumber: 'N', now: NOW }));
  assert.throws(() => buildConversionRecords({ source, invoiceId: 'x', invoiceNumber: '', now: NOW }));
  assert.throws(() => buildConversionRecords({ source: null, invoiceId: 'x', invoiceNumber: 'N', now: NOW }));
});

// ---------------------------------------------------------------------------
// buildDuplicateRecord
// ---------------------------------------------------------------------------
test('duplicate creates a fresh type-default record that never says -COPY', () => {
  const invoiceSource = makeQuotation();
  invoiceSource.meta.docType = 'invoice';
  invoiceSource.meta.number = 'INV/2026-27/0225';
  invoiceSource.meta.status = 'paid';

  const dup = buildDuplicateRecord({ source: invoiceSource, id: 'inv_dup', number: 'INV/2026-27/0230', now: NOW });
  assert.equal(dup.id, 'inv_dup');
  assert.equal(dup.meta.number, 'INV/2026-27/0230');
  assert.ok(!/-COPY/i.test(dup.meta.number));
  assert.equal(dup.meta.docType, 'invoice');
  assert.equal(dup.meta.status, 'pending'); // invoice type default
  assert.equal(dup.status, 'pending');
  assert.equal(dup.duplicatedFromId, 'inv_q1');
});

test('duplicate uses the correct type-default status per docType', () => {
  const data = [
    ['invoice', 'pending'],
    ['quotation', 'sent'],
    ['estimate', 'draft'],
    ['proforma', 'pending']
  ];
  for (const [type, expected] of data) {
    const source = makeQuotation({ id: 'src_' + type });
    source.meta.docType = type;
    const dup = buildDuplicateRecord({ source, id: 'dup_' + type, number: 'DUP/1', now: NOW });
    assert.equal(dup.meta.docType, type);
    assert.equal(dup.meta.status, expected);
  }
});

test('duplicate clears conversion and source links and keeps content', () => {
  const source = makeQuotation({
    convertedToId: 'inv_somewhere',
    convertedToNumber: 'INV/2026-27/0199',
    convertedAt: '2026-10-01T00:00:00.000Z',
    sourceDocId: 'orig_root',
    sourceDocNumber: 'QT/2026-26/001'
  });
  source.meta.status = 'accepted';

  const dup = buildDuplicateRecord({ source, id: 'dup_clean', number: 'INV/2026-27/0400', now: NOW });
  assert.ok(!('convertedToId' in dup));
  assert.ok(!('convertedToNumber' in dup));
  assert.ok(!('convertedAt' in dup));
  assert.ok(!('sourceDocId' in dup));
  assert.ok(!('sourceDocNumber' in dup));
  assert.ok(!('duplicatedFrom' in dup));
  assert.equal(dup.duplicatedFromId, 'inv_q1');
  assert.deepStrictEqual(dup.items, source.items);
  assert.deepStrictEqual(dup.taxes, source.taxes);
  assert.equal(dup.meta.currency, '₹');
  // Content of the original is untouched.
  assert.equal(source.convertedToId, 'inv_somewhere');
});

test('duplicate requires id and number', () => {
  const source = makeQuotation();
  assert.throws(() => buildDuplicateRecord({ source, id: '', number: 'N', now: NOW }));
  assert.throws(() => buildDuplicateRecord({ source, id: 'x', number: '', now: NOW }));
  assert.throws(() => buildDuplicateRecord({ source: null, id: 'x', number: 'N', now: NOW }));
});

test('duplicate stamps fresh dates from now, not the source dates (H5)', () => {
  const source = makeQuotation();
  source.meta.date = '2026-03-20';
  source.meta.dueDate = '2026-04-03';
  source.issueDate = '2026-03-20';
  source.dueDate = '2026-04-03';

  const dup = buildDuplicateRecord({
    source, id: 'inv_dupdate', number: 'INV/2026-27/0500',
    now: new Date(2026, 3, 2, 9, 30) // 2026-04-02 local
  });

  assert.equal(dup.meta.date, '2026-04-02');
  assert.equal(dup.meta.dueDate, '2026-04-16'); // +14 days
  assert.equal(dup.issueDate, '2026-04-02');
  assert.equal(dup.dueDate, '2026-04-16');
  // Content/status/link behavior unchanged.
  assert.equal(dup.duplicatedFromId, source.id);
  assert.ok(!('convertedToId' in dup));
  assert.deepStrictEqual(dup.items, source.items);
});
