import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';

/**
 * The public front door.
 *
 * Everything below is about the one thing that makes this product different
 * from a generic website chatbot: it answers from the dealer's live stock, not
 * from a copy of it.
 */
function Cap({ title, body }: { title: string; body: string }) {
  return (
    <div className="cap">
      <span className="cap-mark" aria-hidden="true">
        ◆
      </span>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

export function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="landing">
      <header className="landing-nav">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true">
            ◆
          </span>
          Diamond Chatbot
        </span>

        {/* Auth actions sit with the brand on the left, as asked. */}
        <nav className="landing-nav-actions">
          {user ? (
            <Link to="/app" className="btn btn-ink">
              Open dashboard
            </Link>
          ) : (
            <>
              <Link to="/login" className="btn btn-ghost">
                Log in
              </Link>
              <Link to="/request-access" className="btn btn-ink">
                Sign up
              </Link>
            </>
          )}
        </nav>
      </header>

      <main className="landing-hero">
        <div className="landing-copy">
          <p className="eyebrow">For diamond dealers</p>
          <h1>
            An assistant that knows
            <br />
            what is <em>actually</em> in your vault.
          </h1>
          <p className="lede">
            It talks to your customers in plain language, searches your real inventory as they
            chat, and reserves a stone before someone else takes it. Your stock stays in your own
            system — nothing is copied, nothing goes stale.
          </p>

          <div className="landing-cta">
            {user ? (
              <Link to="/app" className="btn btn-ink btn-lg">
                Open dashboard
              </Link>
            ) : (
              <>
                <Link to="/request-access" className="btn btn-ink btn-lg">
                  Sign up
                </Link>
                <Link to="/login" className="btn btn-ghost btn-lg">
                  Log in
                </Link>
              </>
            )}
          </div>

          {!user && (
            <p className="landing-note">
              Accounts are set up with you personally, so your ERP is connected properly on day one.
            </p>
          )}
        </div>

        <aside className="landing-demo" aria-label="Example conversation">
          <div className="demo-window">
            <div className="demo-head">
              <span className="brand-mark" aria-hidden="true">
                ◆
              </span>
              Diamond assistant
              <span className="demo-live">Live stock</span>
            </div>
            <div className="demo-body">
              <div className="demo-msg demo-user">Round, about 1 carat, under $12,000</div>
              <div className="demo-msg demo-bot">
                Two in stock right now. The <strong>1.04 ct</strong>, <strong>D</strong> colour,{' '}
                <strong>VVS1</strong> at <strong>$9,400</strong> is the better cut of the pair —
                and still inside your budget.
              </div>
              <div className="demo-cards">
                <div className="demo-card">
                  <div className="demo-card-img" />
                  <strong>1.04 ct Round</strong>
                  <span>D · VVS1 · $9,400</span>
                </div>
                <div className="demo-card">
                  <div className="demo-card-img" />
                  <strong>0.98 ct Round</strong>
                  <span>F · VS1 · $5,180</span>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </main>

      <section className="landing-points">
        <article>
          <h3>Your system stays the source of truth</h3>
          <p>
            Every price and every availability check is read live from your ERP through your own
            API. No spreadsheet upload to keep in sync, and no stone offered after it has sold.
          </p>
        </article>
        <article>
          <h3>It cannot sell the same stone twice</h3>
          <p>
            Diamonds are one of a kind, so availability is re-checked with your system in the
            moment before anything is reserved, quoted or ordered.
          </p>
        </article>
        <article>
          <h3>You set the rules</h3>
          <p>
            Give it your tone, the things it must never say, and what it is allowed to do — quote
            only, hold, or take the full order. Hand over to a person whenever you choose.
          </p>
        </article>
      </section>

      <section className="landing-section">
        <div className="section-head">
          <p className="eyebrow">The idea</p>
          <h2>Selling diamonds is not selling products</h2>
        </div>
        <div className="prose-cols">
          <p>
            A shop selling shoes has a hundred of each size. You have one 1.04 carat D VVS1 round
            — and once it is gone, the closest thing you can offer is a different stone at a
            different price. That single fact breaks every ordinary website chatbot. They answer
            from a copy of your catalogue taken at some point in the past, so they cheerfully
            promise a stone you sold last Tuesday, quote a price from before the last rate change,
            and hand your salesperson an apology to make.
          </p>
          <p>
            Meanwhile the customer asking at 11pm does not know what VVS1 means, cannot tell why one
            stone costs twice another that looks identical on paper, and will not fill in a contact
            form to find out. So the enquiry goes cold, or it lands in your inbox as{' '}
            <em>"price for 1 carat round?"</em> and takes three replies to get anywhere.
          </p>
          <p>
            This assistant closes both gaps. It reads your live inventory at the moment it answers,
            explains the trade-offs in plain language, and can put a stone on hold before the
            conversation ends — so interest turns into a reservation while the customer is still
            interested.
          </p>
        </div>
      </section>

      <section className="landing-section">
        <div className="section-head">
          <p className="eyebrow">How it works</p>
          <h2>Four steps, and your developer only appears in one</h2>
        </div>
        <ol className="how-grid">
          <li>
            <span className="how-num">1</span>
            <h3>Connect your system</h3>
            <p>
              Your developer exposes nine read and write endpoints from whatever holds your stock —
              ERP, custom database, or a spreadsheet behind an API. We test the connection with you
              before anything goes live.
            </p>
          </li>
          <li>
            <span className="how-num">2</span>
            <h3>Paste one snippet</h3>
            <p>
              A single script tag puts the chat window on your site. It carries a public widget key
              that identifies your showroom and never touches your inventory credentials.
            </p>
          </li>
          <li>
            <span className="how-num">3</span>
            <h3>Set the rules</h3>
            <p>
              Your tone, the claims it must never make, how long a hold lasts, and whether it may
              quote, reserve or take a full order. When a question is out of its depth, it hands
              over to a person the way you tell it to.
            </p>
          </li>
          <li>
            <span className="how-num">4</span>
            <h3>Watch it work</h3>
            <p>
              Every conversation, reservation and handover is in your dashboard, along with what the
              assistant costs you to run. Nothing happens that you cannot see afterwards.
            </p>
          </li>
        </ol>
      </section>

      <section className="landing-section">
        <div className="section-head">
          <p className="eyebrow">What it can do</p>
          <h2>Nine things, each one a live call to your system</h2>
          <p className="section-lede">
            It has no memory of your stock to be wrong about. Every answer below is fetched from
            your API in the seconds before the customer reads it.
          </p>
        </div>
        <div className="cap-grid">
          <Cap title="Search stock" body="Shape, carat range, colour, clarity, cut, budget — in the customer's words, not a filter form." />
          <Cap title="Explain a stone" body="Full specification and certificate detail, translated out of the grading vocabulary." />
          <Cap title="Re-check availability" body="Asked again in the moment before anything is promised, because it may have sold since." />
          <Cap title="Compare side by side" body="Why the cheaper stone is cheaper, and when the difference is one nobody will ever see." />
          <Cap title="Hold a diamond" body="Reserved in your own system for the window you set, so two customers never chase one stone." />
          <Cap title="Release a hold" body="Back on the market the moment a customer walks away, without anyone remembering to do it." />
          <Cap title="Send a quotation" body="Your pricing, your terms, generated by your system rather than guessed at by a model." />
          <Cap title="Take an order" body="Only if you allow it. Off by default, and off entirely for showrooms that would rather close by phone." />
          <Cap title="Track an order" body="Answers the where-is-my-stone question that otherwise interrupts your day." />
        </div>
      </section>

      <section className="landing-section">
        <div className="section-head">
          <p className="eyebrow">Built to be trusted with it</p>
          <h2>Your stock, your customers, your data</h2>
        </div>
        <div className="trust-grid">
          <div>
            <h3>Your inventory never leaves your system</h3>
            <p>
              We store no copy of your stones or your prices. Your API key is encrypted before it is
              written down, and the webhook you post changes to is signed, so nobody else can tell
              us a diamond is available.
            </p>
          </div>
          <div>
            <h3>Showrooms cannot see each other</h3>
            <p>
              Every request is scoped to the organisation that made it. Another dealer asking for
              your conversations is told the record does not exist — because as far as their session
              is concerned, it does not.
            </p>
          </div>
          <div>
            <h3>Customer details are handled carefully</h3>
            <p>
              Names, phone numbers and email addresses are encrypted at rest, kept for a period you
              choose, and deletable on request when a customer asks you to erase them.
            </p>
          </div>
          <div>
            <h3>Honest about the AI</h3>
            <p>
              Conversations are processed by Anthropic's Claude, which we name plainly so you can
              disclose it to your own customers. Prices, availability and orders are never invented
              by the model — they come from your system or they are not said at all.
            </p>
          </div>
        </div>
      </section>

      <section className="landing-cta-band">
        <h2>See it answer from your own stock</h2>
        <p>
          The quickest way to judge it is to point it at your inventory and ask it something you
          already know the answer to.
        </p>
        <div className="landing-cta">
          <Link to={user ? '/app' : '/request-access'} className="btn btn-ink btn-lg">
            {user ? 'Open dashboard' : 'Request access'}
          </Link>
          {!user && (
            <Link to="/login" className="btn btn-ghost btn-lg">
              Log in
            </Link>
          )}
        </div>
      </section>

      <footer className="landing-foot">
        <span>Diamond Chatbot</span>
        <span className="muted">Built for dealers who sell one-of-a-kind stones.</span>
      </footer>
    </div>
  );
}
