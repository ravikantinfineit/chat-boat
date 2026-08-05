import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type ConnectionTestResult, type TenantView } from '../lib/api';

/**
 * "Connect Your System" — the screen the spec refers to in section 3.1, where
 * the dealer pastes the API key they generated and we hand back the webhook URL
 * for their developer.
 */
export function TenantFormPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === undefined || id === 'new';
  const navigate = useNavigate();

  const [tenant, setTenant] = useState<TenantView | null>(null);
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [rateLimit, setRateLimit] = useState(60);
  const [holdHours, setHoldHours] = useState(24);
  const [instructions, setInstructions] = useState('');

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew || !id) return;
    api
      .getTenant(id)
      .then((t) => {
        setTenant(t);
        setName(t.name);
        setBaseUrl(t.erp_base_url);
        setCompanyId(t.company_id ?? '');
        setRateLimit(t.erp_rate_limit_per_minute);
        setHoldHours(t.default_hold_hours);
        setInstructions(t.brand_instructions ?? '');
      })
      .catch((e: Error) => setError(e.message));
  }, [id, isNew]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const input = {
        name,
        erp_base_url: baseUrl,
        // On edit, an empty field means "keep the existing key".
        ...(apiKey ? { erp_api_key: apiKey } : {}),
        company_id: companyId || undefined,
        erp_rate_limit_per_minute: rateLimit,
        default_hold_hours: holdHours,
        brand_instructions: instructions || undefined,
      };
      const saved = isNew ? await api.createTenant(input) : await api.updateTenant(id!, input);
      setTenant(saved);
      setApiKey('');
      if (isNew) navigate(`/tenants/${saved.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    if (!tenant) return;
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await api.testConnection(tenant.id));
    } catch (e) {
      setTestResult({ ok: false, error: (e as Error).message });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="layout">
      <h1>{isNew ? 'Connect your system' : name}</h1>
      <p className="subtitle">
        The chatbot reads stock and prices live from your software. It never stores your
        inventory.
      </p>

      <form onSubmit={save}>
        <div className="panel">
          <h2>Connection</h2>
          <p className="hint">
            Where your API lives, and the key that proves requests came from the chatbot.
          </p>

          <div className="field">
            <label htmlFor="name">Showroom name</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>

          <div className="field">
            <label htmlFor="baseUrl">API base URL</label>
            <input
              id="baseUrl"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://erp.your-company.com"
              required
            />
            <p className="help">
              We call <code>{'{base}'}/api/diamonds/search</code> and the other endpoints under it.
            </p>
          </div>

          <div className="row">
            <div className="field">
              <label htmlFor="apiKey">API key</label>
              <input
                id="apiKey"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={isNew ? 'Paste the key you generated' : 'Leave blank to keep current key'}
                required={isNew}
              />
              <p className="help">Sent as an Authorization bearer token. Stored encrypted.</p>
            </div>
            <div className="field">
              <label htmlFor="companyId">Company ID</label>
              <input
                id="companyId"
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                placeholder="abc-diamonds-001"
              />
              <p className="help">Optional. Sent as X-Company-ID for multi-branch systems.</p>
            </div>
          </div>

          <div className="row">
            <div className="field">
              <label htmlFor="rateLimit">Search rate limit (requests per minute)</label>
              <input
                id="rateLimit"
                type="number"
                min={1}
                value={rateLimit}
                onChange={(e) => setRateLimit(Number(e.target.value))}
              />
              <p className="help">We stay under this so your database is never overloaded.</p>
            </div>
            <div className="field">
              <label htmlFor="holdHours">Default hold length (hours)</label>
              <input
                id="holdHours"
                type="number"
                min={1}
                value={holdHours}
                onChange={(e) => setHoldHours(Number(e.target.value))}
              />
              <p className="help">How long a reserved diamond stays off the market.</p>
            </div>
          </div>
        </div>

        <div className="panel">
          <h2>Sales guidance</h2>
          <p className="hint">Anything specific you want the assistant to say or avoid.</p>
          <textarea
            rows={4}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="We only sell natural diamonds. Always mention our lifetime buyback on stones over 1 carat."
          />
        </div>

        {error && <p className="status err">{error}</p>}

        <div className="actions">
          <button className="primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          {tenant && (
            <button type="button" onClick={testConnection} disabled={testing}>
              {testing ? 'Testing…' : 'Test connection'}
            </button>
          )}
          {testResult?.ok && (
            <span className="status ok">
              Connected — {testResult.total_results} diamonds visible
            </span>
          )}
          {testResult && !testResult.ok && (
            <span className="status err">Failed: {testResult.error}</span>
          )}
        </div>
      </form>

      {tenant && (
        <div className="panel" style={{ marginTop: 24 }}>
          <h2>Give these to your developer</h2>
          <p className="hint">
            Post here whenever a diamond's price or stock changes, so the chatbot never quotes a
            stone you have just sold.
          </p>

          <div className="field">
            <label>Webhook URL</label>
            <div className="readonly">{tenant.webhook_url}</div>
          </div>
          <div className="field">
            <label>Webhook secret</label>
            <div className="readonly">{tenant.webhook_secret}</div>
            <p className="help">
              Sign the request body with HMAC-SHA256 and send it as the X-Webhook-Signature header.
            </p>
          </div>
          <div className="field">
            <label>Website widget key</label>
            <div className="readonly">{tenant.widget_key}</div>
            <p className="help">Public. Goes in the chat widget embed on your site.</p>
          </div>
        </div>
      )}
    </div>
  );
}
