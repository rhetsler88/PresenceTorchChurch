import { useState } from "react";
import {
  ArrowRight,
  BellRing,
  Check,
  ChevronRight,
  FileText,
  Headphones,
  LockKeyhole,
  Radio,
  RadioTower,
  Search,
  ShieldCheck,
  Users,
  Volume2,
  Waves,
} from "lucide-react";

const APP_URL = "https://app.presencetorch.net";
const STRIPE_URL = "https://buy.stripe.com/";
const LOGO_SRC = "/presence-torch-logo.png";

const CHANNELS = [
  { name: "Main Worship", members: 7, level: "elevated", active: true },
  { name: "North Entrance", members: 4, level: "routine", active: false },
  { name: "Children's Wing", members: 5, level: "elevated", active: false },
];

const SAFETY_LEVELS = [
  { label: "Routine", color: "green", text: "Normal operations" },
  { label: "Elevated", color: "amber", text: "Heightened awareness" },
  { label: "Secure", color: "red", text: "Immediate response" },
];

const WAVEFORM_HEIGHTS = [16, 28, 42, 62, 34, 78, 52, 88, 44, 70, 32, 56, 26, 46, 18];

export default function LandingPage() {
  const [transmitting, setTransmitting] = useState(false);

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Presence Torch Church home">
          <img className="brand-logo" src={LOGO_SRC} alt="Presence Torch Church" />
        </a>
        <nav className="nav-links" aria-label="Main navigation">
          <a href="#capabilities">Capabilities</a>
          <a href="#safety">Safety levels</a>
          <a href="#organizations">Organizations</a>
        </nav>
        <a className="header-cta" href={APP_URL} target="_blank" rel="noreferrer">
          Open app <ArrowRight size={15} />
        </a>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="app-name reveal reveal-1">Presence Torch Church</p>
          <div className="eyebrow reveal reveal-2">
            <span className="live-dot" /> Built for teams who stand watch
          </div>
          <h1 className="reveal reveal-3">
            When every <em>second</em>
            <br />
            needs a clear voice.
          </h1>
          <p className="hero-description reveal reveal-4">
            Push-to-talk communication designed for church safety teams. Coordinate channels,
            monitor every post, and move the whole team to a new protection level in one decisive
            action.
          </p>
          <div className="hero-actions reveal reveal-5">
            <a className="button button-primary" href={APP_URL} target="_blank" rel="noreferrer">
              Launch radio app <ArrowRight size={18} />
            </a>
            <a className="button button-secondary" href={STRIPE_URL} target="_blank" rel="noreferrer">
              Sign up your organization
            </a>
          </div>
          <div className="trust-row reveal reveal-6">
            <span>
              <Check size={14} /> Browser-based
            </span>
            <span>
              <Check size={14} /> Role-aware access
            </span>
            <span>
              <Check size={14} /> No radio hardware
            </span>
          </div>
        </div>

        <div className="radio-stage reveal reveal-3" aria-label="Interactive radio application preview">
          <div className="signal-field" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>

          <div className="console">
            <div className="console-topbar">
              <div className="console-brand">
                <img src="/presence-torch-icon.png" alt="" /> Presence Torch Command
              </div>
              <div className="system-online">
                <span /> System online
              </div>
            </div>

            <div className="console-body">
              <div className="channel-rail">
                <p className="rail-label">Channels</p>
                {CHANNELS.map((channel) => (
                  <button
                    key={channel.name}
                    type="button"
                    className={`channel-item ${channel.active ? "active" : ""}`}
                  >
                    <span className="channel-icon">
                      <Radio size={14} />
                    </span>
                    <span>
                      <b>{channel.name}</b>
                      <small>{channel.members} connected</small>
                    </span>
                    <span className={`level-pip ${channel.level}`} />
                  </button>
                ))}
                <button type="button" className="all-channel">
                  <RadioTower size={14} /> All channels
                </button>
              </div>

              <div className="talk-panel">
                <div className="channel-heading">
                  <div>
                    <small>ACTIVE CHANNEL</small>
                    <h3>Main Worship</h3>
                  </div>
                  <span className="level-badge amber">
                    <ShieldCheck size={13} /> Elevated
                  </span>
                </div>

                <div className={`waveform ${transmitting ? "active" : ""}`} aria-hidden="true">
                  {WAVEFORM_HEIGHTS.map((height, index) => (
                    <span
                      key={index}
                      style={{ height: `${height}%`, animationDelay: `${index * 45}ms` }}
                    />
                  ))}
                </div>

                <div className="talk-status">
                  <span>{transmitting ? "TRANSMITTING TO 7 MEMBERS" : "CHANNEL CLEAR"}</span>
                  <small>{transmitting ? "Release to finish" : "Hold to speak"}</small>
                </div>

                <button
                  type="button"
                  className={`ptt-button ${transmitting ? "transmitting" : ""}`}
                  onPointerDown={() => setTransmitting(true)}
                  onPointerUp={() => setTransmitting(false)}
                  onPointerLeave={() => setTransmitting(false)}
                  onKeyDown={(event) => event.key === " " && setTransmitting(true)}
                  onKeyUp={(event) => event.key === " " && setTransmitting(false)}
                >
                  <span className="ptt-rings" />
                  <Volume2 size={27} />
                  <b>{transmitting ? "LIVE" : "PUSH TO TALK"}</b>
                </button>

                <div className="listeners">
                  <Headphones size={14} />
                  <span>Command is listening across 3 channels</span>
                </div>
              </div>
            </div>
          </div>

          <div className="floating-alert">
            <BellRing size={17} />
            <span>
              <small>PROTECTION LEVEL</small>
              <b>Elevated across 3 channels</b>
            </span>
          </div>
        </div>
      </section>

      <section className="mission-strip" aria-label="Product principles">
        <span>One touch to speak</span>
        <i />
        <span>One view to listen</span>
        <i />
        <span>One action to protect</span>
      </section>

      <section className="capabilities section" id="capabilities">
        <div className="section-intro">
          <p className="section-kicker">COMMAND WITHOUT CLUTTER</p>
          <h2>
            Your team hears what matters.
            <br />
            <em>Nothing more.</em>
          </h2>
        </div>

        <div className="feature-grid">
          <article className="feature feature-large">
            <div className="feature-number">01</div>
            <div className="feature-icon">
              <Radio />
            </div>
            <h3>Channels that match your posts</h3>
            <p>
              Create dedicated channels for entrances, worship spaces, children's areas, medical
              response, or any post your plan requires.
            </p>
            <div className="mini-channel-list">
              {[
                { name: "South Lot", online: 3 },
                { name: "Sanctuary", online: 8 },
                { name: "Medical Team", online: 2 },
              ].map((item) => (
                <div key={item.name}>
                  <span>
                    <Radio size={13} /> {item.name}
                  </span>
                  <small>{item.online} online</small>
                </div>
              ))}
            </div>
          </article>

          <article className="feature feature-wide">
            <div className="feature-number">02</div>
            <div className="feature-icon">
              <Headphones />
            </div>
            <h3>Listen across the whole operation</h3>
            <p>
              Designated leaders can monitor multiple channels at once without pulling every team
              member into every conversation.
            </p>
            <div className="monitor-visual">
              <span>
                <i /> South Lot
              </span>
              <span className="active">
                <i /> Sanctuary{" "}
                <b>
                  <Waves size={14} /> LIVE
                </b>
              </span>
              <span>
                <i /> Children's Wing
              </span>
            </div>
          </article>

          <article className="feature feature-compact">
            <div className="feature-number">03</div>
            <div className="feature-icon">
              <RadioTower />
            </div>
            <h3>Broadcast to everyone</h3>
            <p>Reach every active channel when a message cannot wait.</p>
            <div className="broadcast-orbit">
              <RadioTower size={25} />
              <i />
              <i />
              <i />
            </div>
          </article>

          <article className="feature feature-compact feature-accent">
            <div className="feature-number">04</div>
            <div className="feature-icon">
              <Users />
            </div>
            <h3>Give access with intent</h3>
            <p>Assign the right listening and broadcast capabilities to each person.</p>
            <div className="role-row">
              <span>User</span>
              <span>Lead</span>
              <span>Director</span>
              <span>Admin</span>
            </div>
          </article>

          <article className="feature feature-wide feature-full">
            <div className="feature-number">05</div>
            <div className="feature-icon">
              <FileText />
            </div>
            <h3>Transcripts and incident logs</h3>
            <p>
              Voice messages are automatically transcribed. All channel communications are logged,
              and administrators can export selected logs to Google Docs&trade; when needed for later safety
              incident reports.
            </p>
            <div className="transcript-console" aria-label="Transcript log preview">
              <div className="transcript-console-top">
                <div>
                  <h4>Transcript Log</h4>
                  <small>17 recordings &amp; transcripts · last 15 days</small>
                </div>
                <div className="transcript-console-actions">
                  <button type="button" className="transcript-export-btn">
                    <FileText size={13} />
                    Export to Google Doc
                  </button>
                  <div className="transcript-user">
                    <span className="transcript-avatar">JD</span>
                    <span>John Doe</span>
                  </div>
                </div>
              </div>

              <div className="transcript-export-panel">
                <div className="transcript-export-head">
                  <span>Select dates to export</span>
                  <span className="transcript-export-controls">
                    <button type="button">Select all</button>
                    <button type="button">Clear</button>
                  </span>
                </div>
                <div className="transcript-date-pills">
                  <span className="active">Sunday, Jul 26, 2026</span>
                  <span>Friday, Jul 24, 2026</span>
                </div>
                <small>13 entries selected</small>
              </div>

              <div className="transcript-search">
                <Search size={14} />
                <span>Search transcripts...</span>
              </div>

              <div className="transcript-day-list">
                <div className="transcript-day active">
                  <span className="transcript-check checked">
                    <Check size={11} strokeWidth={3} />
                  </span>
                  <span className="transcript-day-label">Sunday, Jul 26, 2026 (13)</span>
                  <ChevronRight size={14} />
                </div>
                <div className="transcript-day">
                  <span className="transcript-check" />
                  <span className="transcript-day-label muted">Friday, Jul 24, 2026 (4)</span>
                  <ChevronRight size={14} />
                </div>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section className="safety-section section" id="safety">
        <div className="safety-copy">
          <p className="section-kicker">SHARED SITUATIONAL AWARENESS</p>
          <h2>A protection level everyone understands.</h2>
          <p>
            Set a safety posture for each channel individually. When the situation changes broadly,
            update the entire organization at once—without repeating the same message post by post.
          </p>
          <ul>
            <li>
              <Check size={15} /> Independent channel-level controls
            </li>
            <li>
              <Check size={15} /> Organization-wide level changes
            </li>
            <li>
              <Check size={15} /> Clear visual status for every user
            </li>
          </ul>
        </div>

        <div className="safety-console">
          <div className="safety-console-head">
            <span>
              <ShieldCheck size={18} /> Organization protection level
            </span>
            <small>ALL CHANNELS</small>
          </div>
          <div className="level-stack">
            {SAFETY_LEVELS.map((level) => (
              <button key={level.label} type="button" className={`safety-level ${level.color}`}>
                <span className="safety-radio" />
                <span>
                  <b>{level.label}</b>
                  <small>{level.text}</small>
                </span>
                <ChevronRight size={18} />
              </button>
            ))}
          </div>
          <div className="safety-note">
            <LockKeyhole size={14} /> Organization administrators only
          </div>
        </div>
      </section>

      <section className="organization-section" id="organizations">
        <div className="organization-inner">
          <img
            className="organization-logo"
            src="/presence-torch-wordmark.webp"
            alt="Presence Torch Church"
          />
          <p className="section-kicker">READY FOR SUNDAY. READY FOR MORE.</p>
          <h2>
            Put a clearer channel
            <br />
            between risk and response.
          </h2>
          <p>
            Equip your church safety organization with a communication system built around how your
            team actually operates.
          </p>
          <div className="org-actions">
            <a className="button button-light" href={STRIPE_URL} target="_blank" rel="noreferrer">
              Start organization signup <ArrowRight size={18} />
            </a>
            <a className="text-link" href={APP_URL} target="_blank" rel="noreferrer">
              Already have access? Open the app <ChevronRight size={16} />
            </a>
          </div>
        </div>
      </section>

      <footer>
        <div className="footer-main">
          <a className="brand" href="#top" aria-label="Presence Torch Church home">
            <img className="brand-logo" src={LOGO_SRC} alt="Presence Torch Church" />
          </a>
          <p>Purpose-built communication for church safety teams.</p>
          <div className="footer-meta">
            <nav className="footer-links" aria-label="Legal">
              <a href={`${APP_URL}/privacy`} target="_blank" rel="noreferrer">
                Privacy Policy
              </a>
              <a href={`${APP_URL}/terms`} target="_blank" rel="noreferrer">
                Terms of Service
              </a>
            </nav>
            <span>© {new Date().getFullYear()} Presence Torch Church</span>
          </div>
        </div>
        <p className="footer-disclaimer">
          Google Docs&trade; is a trademark of Google LLC.
        </p>
      </footer>
    </main>
  );
}
