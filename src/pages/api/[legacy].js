import catalog from '../../../api/catalog.js';
import manage from '../../../api/manage.js';
import prices from '../../../api/prices.js';
import sitemap from '../../../api/sitemap.js';
const handlers = { catalog, manage, prices, sitemap };
export const config = { api: { bodyParser: { sizeLimit: '3mb' }, responseLimit: '4mb' } };
export default function handler(req, res) {
  const endpoint = Object.hasOwn(handlers, req.query.legacy) ? handlers[req.query.legacy] : null;
  if (!endpoint) return res.status(404).json({ error: 'Not found' });
  return endpoint(req, res);
}
