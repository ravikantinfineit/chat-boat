#!/usr/bin/env node
/**
 * A stand-in for the dealer's ERP, implementing the contract in spec section 3.
 *
 * It exists so the chatbot can be developed and demoed before the client's
 * developer has built their side, and so the tool-calling flow can be tested
 * end to end. No dependencies — run it with `pnpm mock-erp`.
 *
 *   MOCK_ERP_PORT=4000 MOCK_ERP_API_KEY=test-key node apps/api/tools/mock-erp.mjs
 */

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

// Honours the same ERP_MOCK_* vars as apps/erp-mock so the two cannot drift.
const PORT = Number(process.env.ERP_MOCK_PORT ?? process.env.MOCK_ERP_PORT ?? 4010);
const API_KEY = process.env.ERP_MOCK_API_KEY ?? process.env.MOCK_ERP_API_KEY ?? 'test-key';

const SHAPES = ['Round', 'Princess', 'Oval', 'Emerald', 'Cushion', 'Pear'];
const COLORS = ['D', 'E', 'F', 'G', 'H', 'I'];
const CLARITIES = ['IF', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1'];
const CUTS = ['Excellent', 'Very Good', 'Good'];

/** Deterministic inventory so repeated runs behave the same. */
const diamonds = new Map();
for (let i = 0; i < 60; i++) {
  const id = `DM-${20300 + i}`;
  const carat = Number((0.5 + (i % 20) * 0.09).toFixed(2));
  const color = COLORS[i % COLORS.length];
  const clarity = CLARITIES[i % CLARITIES.length];
  const shape = SHAPES[i % SHAPES.length];
  const cut = CUTS[i % CUTS.length];
  const price = Math.round(carat * 4200 * (1 + (COLORS.length - COLORS.indexOf(color)) * 0.06));
  diamonds.set(id, {
    diamond_id: id,
    certificate_no: `GIA-${2185847000 + i}`,
    lab: 'GIA',
    certificate_url: `https://example.com/certs/${id}.pdf`,
    carat,
    cut,
    color,
    clarity,
    shape,
    polish: 'Excellent',
    symmetry: i % 3 === 0 ? 'Excellent' : 'Very Good',
    fluorescence: i % 4 === 0 ? 'Faint' : 'None',
    measurements: `${(4.5 + carat).toFixed(2)} x ${(4.5 + carat).toFixed(2)} x ${(2.8 + carat * 0.6).toFixed(2)} mm`,
    depth_percent: Number((60 + (i % 5) * 0.7).toFixed(1)),
    table_percent: Number((55 + (i % 6) * 0.8).toFixed(1)),
    price,
    currency: 'USD',
    discount_percent: i % 7 === 0 ? 5 : 0,
    stock_status: i % 11 === 0 ? 'Sold' : 'In Stock',
    quantity_available: 1,
    location: i % 2 === 0 ? 'Mumbai Vault' : 'Surat Office',
    image_urls: [`https://example.com/img/${id}-1.jpg`],
    video_url: `https://example.com/360/${id}`,
    diamond_type: i % 5 === 0 ? 'Lab-Grown' : 'Natural',
    tags: i % 3 === 0 ? ['bridal', 'solitaire'] : ['investment-grade'],
  });
}

const holds = new Map();
const orders = new Map();

const summary = (d) => ({
  diamond_id: d.diamond_id,
  shape: d.shape,
  carat: d.carat,
  color: d.color,
  clarity: d.clarity,
  cut: d.cut,
  price: d.price,
  currency: d.currency,
  stock_status: d.stock_status,
  image_urls: d.image_urls,
  certificate_no: d.certificate_no,
});

const gradeIndex = (list, value) => (value ? list.indexOf(String(value).toUpperCase()) : -1);

function search(query) {
  const page = Number(query.get('page') ?? 1);
  const limit = Math.min(Number(query.get('limit') ?? 10), 50);

  let results = [...diamonds.values()];
  const shape = query.get('shape');
  if (shape) results = results.filter((d) => d.shape.toLowerCase() === shape.toLowerCase());
  if (query.get('carat_min')) results = results.filter((d) => d.carat >= Number(query.get('carat_min')));
  if (query.get('carat_max')) results = results.filter((d) => d.carat <= Number(query.get('carat_max')));
  if (query.get('price_min')) results = results.filter((d) => d.price >= Number(query.get('price_min')));
  if (query.get('price_max')) results = results.filter((d) => d.price <= Number(query.get('price_max')));
  if (query.get('cut')) results = results.filter((d) => d.cut.toLowerCase() === query.get('cut').toLowerCase());
  if (query.get('diamond_type')) {
    results = results.filter((d) => d.diamond_type.toLowerCase() === query.get('diamond_type').toLowerCase());
  }
  if (query.get('stock_status')) {
    results = results.filter((d) => d.stock_status === query.get('stock_status'));
  }
  // Colour and clarity are ordered scales: "F to H" means index range, not string compare.
  const colorMin = gradeIndex(COLORS, query.get('color_min'));
  const colorMax = gradeIndex(COLORS, query.get('color_max'));
  if (colorMin >= 0) results = results.filter((d) => COLORS.indexOf(d.color) >= colorMin);
  if (colorMax >= 0) results = results.filter((d) => COLORS.indexOf(d.color) <= colorMax);
  const clarityMin = gradeIndex(CLARITIES, query.get('clarity_min'));
  if (clarityMin >= 0) results = results.filter((d) => CLARITIES.indexOf(d.clarity) <= clarityMin);

  const start = (page - 1) * limit;
  return {
    total_results: results.length,
    page,
    results: results.slice(start, start + limit).map(summary),
  };
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const send = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  };

  // Spec 3.1 — every request must carry the bearer token.
  if (req.headers.authorization !== `Bearer ${API_KEY}`) {
    return send(401, { error: 'unauthorized', message: 'Missing or invalid Authorization header' });
  }

  const path = url.pathname;
  const body = req.method === 'POST' ? await readBody(req) : {};

  // GET /api/diamonds/search
  if (req.method === 'GET' && path === '/api/diamonds/search') {
    return send(200, search(url.searchParams));
  }

  // GET /api/diamonds/{id}/availability
  let match = path.match(/^\/api\/diamonds\/([^/]+)\/availability$/);
  if (req.method === 'GET' && match) {
    const d = diamonds.get(decodeURIComponent(match[1]));
    if (!d) return send(404, { error: 'not_found' });
    return send(200, {
      diamond_id: d.diamond_id,
      stock_status: d.stock_status,
      price: d.price,
      currency: d.currency,
      last_updated: new Date().toISOString(),
    });
  }

  // POST /api/diamonds/{id}/hold
  match = path.match(/^\/api\/diamonds\/([^/]+)\/hold$/);
  if (req.method === 'POST' && match) {
    const d = diamonds.get(decodeURIComponent(match[1]));
    if (!d) return send(404, { error: 'not_found' });
    if (d.stock_status !== 'In Stock') {
      return send(409, { error: 'unavailable', message: `Diamond is ${d.stock_status}` });
    }
    const hours = Number(body.hold_duration_hours ?? 24);
    const holdId = `HOLD-${Math.floor(10000 + Math.random() * 89999)}`;
    const expiresAt = new Date(Date.now() + hours * 3600_000).toISOString();
    d.stock_status = 'Reserved';
    holds.set(holdId, { hold_id: holdId, diamond_id: d.diamond_id, expires_at: expiresAt });
    return send(200, {
      hold_id: holdId,
      diamond_id: d.diamond_id,
      status: 'Held',
      expires_at: expiresAt,
    });
  }

  // POST /api/diamonds/{id}/release
  match = path.match(/^\/api\/diamonds\/([^/]+)\/release$/);
  if (req.method === 'POST' && match) {
    const d = diamonds.get(decodeURIComponent(match[1]));
    const hold = holds.get(body.hold_id);
    if (!d || !hold) return send(404, { error: 'not_found' });
    holds.delete(body.hold_id);
    d.stock_status = 'In Stock';
    return send(200, { released: true, hold_id: body.hold_id });
  }

  // POST /api/diamonds/compare
  if (req.method === 'POST' && path === '/api/diamonds/compare') {
    const ids = Array.isArray(body.diamond_ids) ? body.diamond_ids : [];
    return send(200, ids.map((id) => diamonds.get(id)).filter(Boolean));
  }

  // POST /api/quotations
  if (req.method === 'POST' && path === '/api/quotations') {
    const ids = Array.isArray(body.diamond_ids) ? body.diamond_ids : [];
    const total = ids.reduce((sum, id) => sum + (diamonds.get(id)?.price ?? 0), 0);
    const quotationId = `QT-${Math.floor(10000 + Math.random() * 89999)}`;
    const days = Number(body.valid_for_days ?? 7);
    return send(200, {
      quotation_id: quotationId,
      pdf_url: `https://example.com/quotes/${quotationId}.pdf`,
      total_amount: total,
      currency: 'USD',
      valid_until: new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10),
    });
  }

  // POST /api/orders
  if (req.method === 'POST' && path === '/api/orders') {
    const ids = Array.isArray(body.diamond_ids) ? body.diamond_ids : [];
    const total = ids.reduce((sum, id) => sum + (diamonds.get(id)?.price ?? 0), 0);
    const orderId = `ORD-${Math.floor(10000 + Math.random() * 89999)}`;
    for (const id of ids) {
      const d = diamonds.get(id);
      if (d) d.stock_status = 'Sold';
    }
    const order = {
      order_id: orderId,
      status: 'Confirmed',
      total_amount: total,
      currency: 'USD',
      estimated_delivery: new Date(Date.now() + 10 * 86400_000).toISOString().slice(0, 10),
      tracking_number: `IN${Math.floor(10000000 + Math.random() * 89999999)}`,
      _ref: randomUUID(),
    };
    orders.set(orderId, order);
    return send(200, order);
  }

  // GET /api/orders/{id}
  match = path.match(/^\/api\/orders\/([^/]+)$/);
  if (req.method === 'GET' && match) {
    const order = orders.get(decodeURIComponent(match[1]));
    if (!order) return send(404, { error: 'not_found' });
    return send(200, {
      order_id: order.order_id,
      status: 'Shipped',
      tracking_number: order.tracking_number,
      estimated_delivery: order.estimated_delivery,
    });
  }

  // GET /api/diamonds/{id}  — checked last so it doesn't shadow the sub-routes
  match = path.match(/^\/api\/diamonds\/([^/]+)$/);
  if (req.method === 'GET' && match) {
    const d = diamonds.get(decodeURIComponent(match[1]));
    if (!d) return send(404, { error: 'not_found' });
    return send(200, d);
  }

  send(404, { error: 'not_found', message: `No route for ${req.method} ${path}` });
});

server.listen(PORT, () => {
  console.log(`Mock ERP listening on http://localhost:${PORT}`);
  console.log(`Authorization: Bearer ${API_KEY}`);
  console.log(`${diamonds.size} diamonds loaded`);
});
