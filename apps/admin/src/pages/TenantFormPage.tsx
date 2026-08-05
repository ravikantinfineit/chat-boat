import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CopyField } from '../components/CopyField';
import { api, type ConnectionTestResult, type TenantView } from '../lib/api';

/**
 * "Connect Your System" — where the dealer pastes the API key they generated,
 * and we hand back the webhook URL for their developer.
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
    <main className="layout">
      <div className="page-head">
        <div>
          <h1>{isNew ? 'Connect your system' : name || 'Showroom'}</h1>
          <p className="subtitle">
            The assistant reads stock and prices live from your software every time a customer
            asks. It never stores your inventory.
          </p>
        </div>
      </div>

      <form onSubmit={save}>
        <div className="panel">
          <h2>Connection</h2>
          <p className="hint">Where your API lives, and the key that proves requests came from us.</p>

          <div className="field">
            <label htmlFor="name">Showroom name</label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Demo Diamonds"
              required
            />
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
              We call <code>/api/diamonds/search</code> and the other endpoints beneath it.
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
              <p className="help">Sent as a bearer token. Encrypted before it is stored.</p>
            </div>
            <div className="field">
              <label htmlFor="companyId">Company ID</label>
              <input
                id="companyId"
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                placeholder="abc-diamonds-001"
              />
              <p className="help">Optional. For systems serving more than one branch.</p>
            </div>
          </div>

          <div className="row">
            <div className="field">
              <label htmlFor="rateLimit">Search rate limit</label>
              <input
                id="rateLimit"
                type="number"
                min={1}
                value={rateLimit}
                onChange={(e) => setRateLimit(Number(e.target.value))}
              />
              <p className="help">Requests per minute. We stay under it so your database is never overloaded.</p>
            </div>
            <div className="field">
              <label htmlFor="holdHours">Default hold length</label>
              <input
                id="holdHours"
                type="number"
                min={1}
                value={holdHours}
                onChange={(e) => setHoldHours(Number(e.target.value))}
              />
              <p className="help">Hours a reserved diamond stays off the market.</p>
            </div>
          </div>
        </div>

        <div className="panel">
          <h2>Sales guidance</h2>
          <p className="hint">Anything specific you want the assistant to say, or avoid saying.</p>
          <textarea
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
            <span className="pill ok">
              <span className="dot" aria-hidden="true" />
              Connected — {testResult.total_results} diamonds visible
            </span>
          )}
          {testResult && !testResult.ok && (
            <span className="pill err">
              <span className="dot" aria-hidden="true" />
              {testResult.error}
            </span>
          )}
        </div>
      </form>

      {tenant && (
        <div className="panel panel-accent" style={{ marginTop: 28 }}>
          <h2>Give these to your developer</h2>
          <p className="hint">
            Post to this URL whenever a diamond's price or stock changes, so the assistant never
            offers a stone you have just sold.
          </p>

          <CopyField label="Webhook URL" value={tenant.webhook_url} />
          <CopyField
            label="Webhook secret"
            value={tenant.webhook_secret}
            help="Sign the request body with HMAC-SHA256 and send it as the X-Webhook-Signature header."
          />
          <CopyField
            label="Website widget key"
            value={tenant.widget_key}
            help="Public by design — it identifies the showroom and never reaches your ERP."
          />
        </div>
      )}
    </main>
  );
}
