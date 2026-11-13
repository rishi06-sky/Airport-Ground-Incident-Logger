import React, { useState, useEffect, createContext, useContext } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  Link,
  useNavigate,
  useParams,
} from "react-router-dom";
import axios from "axios";
import {
  Plane,
  LayoutDashboard,
  FilePlus2,
  GitBranch,
  Activity,
  ShieldCheck,
  Network,
  LogOut,
  Menu,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Search,
  RefreshCw,
  Bell,
  Users,
  FlaskConical,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";
import "./styles.css";
import { PriorityLabel, filterIncidents } from "./view-utils.jsx";
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  timeout: 12000,
});
api.interceptors.request.use((c) => {
  const token = sessionStorage.getItem("agil-token");
  if (token) c.headers.Authorization = `Bearer ${token}`;
  return c;
});
const Context = createContext();
const categories = [
  "FOD",
  "Damage",
  "Delay",
  "Safety-Breach",
  "Equipment-Failure",
];
const statuses = ["Pending", "Assigned", "In Progress", "Resolved"];
const message = (e) =>
  e.response?.data?.errors?.join("; ") || e.response?.data?.error || e.message;
const Badge = ({ children }) => (
  <span
    className={`badge ${String(children).toLowerCase().replaceAll(" ", "-")}`}
  >
    {children}
  </span>
);
function useLoad(url, initial = null) {
  const [data, setData] = useState(initial),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  async function reload() {
    setLoading(true);
    try {
      setData((await api.get(url)).data);
      setError("");
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    reload();
  }, [url]);
  return { data, error, loading, reload };
}
function State({ load, children }) {
  if (load.loading)
    return <div className="empty">Loading operational records…</div>;
  if (load.error)
    return (
      <div role="alert" className="error">
        {load.error} <button onClick={load.reload}>Retry</button>
      </div>
    );
  return children;
}
function Login() {
  const { setUser, notify } = useContext(Context);
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      sessionStorage.setItem("agil-token", data.token);
      setUser((await api.get("/auth/me")).data);
      navigate("/");
    } catch (e) {
      notify(message(e), true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login">
      <section className="login-story">
        <div className="brand">
          <Plane size={32} /> AGIL<span>GROUND OPERATIONS</span>
        </div>
        <div>
          <span className="eyebrow">AIRPORT GROUND INCIDENT LOGGER</span>
          <h1>
            Safer ground.
            <br />
            Smoother operations.
          </h1>
          <p>
            One coordinated workspace to report, route, and resolve incidents
            across the apron.
          </p>
          <div className="runway">
            <Plane size={90} />
            <i />
            <i />
            <i />
          </div>
        </div>
        <small>
          Engineering demonstration · Fictional operational assignments
        </small>
      </section>
      <section className="login-form">
        <span className="eyebrow">OPERATIONS WORKSPACE</span>
        <h2>Welcome back</h2>
        <p className="muted">
          Sign in with your provisioned airport staff account.
        </p>
        <form onSubmit={submit}>
          <label>
            Work email
            <input
              autoComplete="username"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              autoComplete="current-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? "Signing in…" : "Sign in to workspace"}{" "}
            <ArrowUpRight size={17} />
          </button>
        </form>
        <p className="muted small">
          Access is controlled by your administrator. Demo accounts are created
          with the locally configured demo password.
        </p>
      </section>
    </div>
  );
}
function Shell() {
  const { user, setUser } = useContext(Context),
    [open, setOpen] = useState(false);
  const nav = [
    ["/", "Overview", LayoutDashboard],
    ["/reports", "Incident reports", Activity],
    ...(user.role === "supervisor"
      ? [["/handler", "My assignments", Users]]
      : []),
    ...(["staff", "admin"].includes(user.role)
      ? [["/submit", "New incident", FilePlus2]]
      : []),
    ...(["admin", "supervisor", "safety"].includes(user.role)
      ? [["/routing", "Dispatch & teams", GitBranch]]
      : []),
    ["/analytics", "Analytics", Network],
    ...(["admin", "safety"].includes(user.role)
      ? [["/safety", "Safety center", ShieldCheck]]
      : []),
    ["/dfa", "DFA simulator", FlaskConical],
    ["/demo", "Test demonstration", CheckCircle2],
    ...(user.role === "admin" ? [["/admin", "Administration", Users]] : []),
  ];
  return (
    <div className="app">
      <aside className={open ? "open" : ""}>
        <div className="brand">
          <Plane /> AGIL<span>GROUND OPERATIONS</span>
        </div>
        <div className="side-label">WORKSPACE</div>
        <nav>
          {nav.map(([to, label, Icon]) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              onClick={() => setOpen(false)}
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="demo-dot" /> Engineering demonstration
          <p>Fictional airport operations</p>
          <button
            onClick={() => {
              sessionStorage.removeItem("agil-token");
              setUser(null);
            }}
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header>
          <button
            className="mobile-menu"
            aria-label="Toggle menu"
            onClick={() => setOpen(!open)}
          >
            <Menu />
          </button>
          <span>
            Operations / <strong>Ground control</strong>
          </span>
          <div className="header-user">
            <span className="live-dot" /> Workspace online{" "}
            <div className="avatar">{user.name?.slice(0, 2).toUpperCase()}</div>
            <div>
              <strong>{user.name}</strong>
              <small>{user.role}</small>
            </div>
          </div>
        </header>
        <main>
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/handler" element={<HandlerDashboard />} />
            <Route path="/submit" element={<Submit />} />
            <Route path="/incidents/:id" element={<Details />} />
            <Route path="/routing" element={<Routing />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/safety" element={<Safety />} />
            <Route path="/dfa" element={<Simulator />} />
            <Route path="/demo" element={<Simulator demo />} />
            <Route path="/admin" element={<Admin />} />
            <Route
              path="*"
              element={
                <div className="empty">
                  Page not found. <Link to="/">Return to overview</Link>
                </div>
              }
            />
          </Routes>
        </main>
        <footer>
          AGIL / Airport Ground Incident Logger{" "}
          <span>BCS503 Automata · BCS502 Computer Networks</span>
        </footer>
      </div>
    </div>
  );
}
function Title({ kicker = "GROUND OPERATIONS", title, description, children }) {
  return (
    <div className="page-title">
      <div>
        <span className="eyebrow">{kicker}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div>{children}</div>
    </div>
  );
}
function Metrics({ data }) {
  return (
    <div className="metrics">
      {[
        ["Total incidents", data.total, Activity],
        ["Awaiting resolution", data.unresolved, Clock],
        ["Resolved incidents", data.resolved, CheckCircle2],
        ["Critical incidents", data.critical, ShieldCheck],
      ].map(([label, value, Icon]) => (
        <div className="metric" key={label}>
          <div>
            <span>{label}</span>
            <Icon size={19} />
          </div>
          <strong>{value ?? 0}</strong>
          <small>
            {label === "Critical incidents"
              ? "Prioritized for immediate handling"
              : "Within your permitted reports"}
          </small>
        </div>
      ))}
    </div>
  );
}
function Chart({ title, data, line = false }) {
  return (
    <section className="panel chart">
      <h3>{title}</h3>
      {!data?.length ? (
        <div className="empty">No incident data for this period.</div>
      ) : (
        <ResponsiveContainer width="100%" height={235}>
          {line ? (
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#3274de"
                strokeWidth={3}
              />
            </LineChart>
          ) : (
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar
                dataKey="value"
                fill="#3777df"
                radius={[5, 5, 0, 0]}
                maxBarSize={45}
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      )}
    </section>
  );
}
function Overview() {
  const load = useLoad("/dashboard/summary"),
    reports = useLoad("/incidents", []),
    { user } = useContext(Context);
  return (
    <>
      <Title
        title="Operations overview"
        description="A clear view of incidents, priorities, and ground response."
      >
        {["staff", "admin"].includes(user.role) && (
          <Link className="primary" to="/submit">
            <FilePlus2 size={17} /> Report incident
          </Link>
        )}
      </Title>
      <State load={load}>
        {load.data && (
          <>
            <Metrics data={load.data} />
            <div className="overview-banner">
              <div className="banner-icon">
                <Plane size={30} />
              </div>
              <div>
                <h3>Every report starts a safer response.</h3>
                <p>
                  Validate identifiers, coordinate the right team, and track
                  every step to resolution.
                </p>
              </div>
              <Link to="/dfa">
                Explore validation <ArrowUpRight size={17} />
              </Link>
            </div>
            <div className="chart-grid">
              <Chart
                title="Incidents by category"
                data={load.data.categories}
              />
              <section className="panel">
                <h3>Response status</h3>
                <div className="status-list">
                  {statuses.map((s) => (
                    <div key={s}>
                      <Badge>{s}</Badge>
                      <strong>
                        {load.data.status.find((x) => x.name === s)?.value || 0}
                      </strong>
                    </div>
                  ))}
                </div>
                <div className="info-note">
                  Critical incidents lead the waiting queue. Identifier
                  validation always comes first.
                </div>
              </section>
            </div>
          </>
        )}
      </State>
      <section className="panel">
        <div className="section-heading">
          <h3>Recent incident reports</h3>
          <Link to="/reports">
            View all reports <ArrowUpRight size={15} />
          </Link>
        </div>
        <State load={reports}>
          <IncidentTable rows={reports.data.slice(0, 5)} />
        </State>
      </section>
    </>
  );
}
function IncidentTable({ rows }) {
  return !rows.length ? (
    <div className="empty">
      <Activity size={30} />
      <h3>No incidents to display</h3>
      <p>Submitted reports will appear here with their live dispatch status.</p>
    </div>
  ) : (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {[
              "Report / aircraft",
              "Category",
              "Zone",
              "Priority",
              "Status",
              "Handler",
              "",
            ].map((x) => (
              <th key={x}>{x}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.reportId}>
              <td>
                <Link className="report-link" to={`/incidents/${r.reportId}`}>
                  {r.reportId}
                </Link>
                <small>
                  {r.aircraftRegistration} · {r.carrierCode}
                </small>
              </td>
              <td>{r.category}</td>
              <td>
                <span className="zone">{r.zone}</span>
              </td>
              <td>
                <PriorityLabel priority={r.priority} />
              </td>
              <td>
                <Badge>{r.status}</Badge>
              </td>
              <td>{r.assignedHandler || "Awaiting dispatch"}</td>
              <td>
                <Link
                  aria-label={`View ${r.reportId}`}
                  to={`/incidents/${r.reportId}`}
                >
                  <ArrowUpRight size={18} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Reports() {
  const [filters, setFilters] = useState({
    search: "",
    category: "",
    status: "",
    from: "",
    to: "",
  });
  const load = useLoad("/incidents?" + new URLSearchParams(filters), []);
  return (
    <>
      <Title
        title="Incident reports"
        description="Find a report and follow its response from submission to resolution."
      />
      <section className="panel">
        <div className="filters">
          <label className="search">
            <Search size={17} />
            <input
              placeholder="Search report ID or aircraft"
              value={filters.search}
              onChange={(e) =>
                setFilters({ ...filters, search: e.target.value })
              }
            />
          </label>
          {["category", "status"].map((key) => (
            <label key={key}>
              <span className="sr-only">{key}</span>
              <select
                value={filters[key]}
                onChange={(e) =>
                  setFilters({ ...filters, [key]: e.target.value })
                }
              >
                <option value="">
                  All {key === "category" ? "categories" : "statuses"}
                </option>
                {(key === "category" ? categories : statuses).map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          ))}
          {["from", "to"].map((k) => (
            <label key={k}>
              {k}
              <input
                type="date"
                value={filters[k]}
                onChange={(e) =>
                  setFilters({ ...filters, [k]: e.target.value })
                }
              />
            </label>
          ))}
        </div>
        <State load={load}>
          <IncidentTable rows={filterIncidents(load.data, filters.search)} />
        </State>
      </section>
    </>
  );
}
const blank = () => ({
  reporterName: "",
  contact: "",
  aircraftRegistration: "",
  incidentCode: "",
  carrierCode: "AI",
  zone: "A",
  description: "",
  urgency: "Normal",
  occurredAt: new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16),
});
function Submit() {
  const { user, notify } = useContext(Context),
    [data, setData] = useState({ ...blank(), reporterName: user.name }),
    [result, setResult] = useState(null),
    [file, setFile] = useState(null),
    [busy, setBusy] = useState(false),
    [key, setKey] = useState(crypto.randomUUID()),
    [done, setDone] = useState(null);
  const navigate = useNavigate();
  useEffect(() => {
    if (
      !data.aircraftRegistration ||
      !data.incidentCode ||
      data.description.length < 4
    )
      return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api
        .post("/validation/check", data, { signal: controller.signal })
        .then((r) => setResult(r.data))
        .catch((e) => {
          if (!axios.isCancel(e)) setResult(null);
        });
    }, 500);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    data.aircraftRegistration,
    data.incidentCode,
    data.description,
    data.urgency,
    data.carrierCode,
  ]);
  function edit(k, v) {
    setData({ ...data, [k]: v });
    if (
      [
        "aircraftRegistration",
        "incidentCode",
        "description",
        "urgency",
        "carrierCode",
      ].includes(k)
    )
      setResult(null);
  }
  async function check() {
    try {
      const r = await api.post("/validation/check", data);
      setResult(r.data);
      return r.data;
    } catch (e) {
      notify(message(e), true);
      return null;
    }
  }
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const form = new FormData();
      Object.entries(data).forEach(([k, v]) =>
        form.append(k, k === "occurredAt" ? new Date(v).toISOString() : v),
      );
      if (file) form.append("attachment", file);
      const r = await api.post("/incidents", form, {
        headers: { "Idempotency-Key": key },
      });
      setDone(r.data);
      setKey(crypto.randomUUID());
      notify("Incident saved and dispatch evaluated.");
    } catch (e) {
      setResult(e.response?.data?.validation || null);
      notify(message(e), true);
    } finally {
      setBusy(false);
    }
  }
  if (done)
    return (
      <section className="panel success">
        <CheckCircle2 size={48} />
        <h1>Incident recorded</h1>
        <p>
          {done.reportId} · {done.category}
        </p>
        <Badge>{done.status}</Badge>
        <p>{done.routingDecision}</p>
        <button
          className="primary"
          onClick={() => navigate(`/incidents/${done.reportId}`)}
        >
          View incident
        </button>
      </section>
    );
  return (
    <>
      <Title
        title="Report an incident"
        description="Accurate details help the right team respond. All fields except attachments are required."
      />
      <div className="form-layout">
        <form className="panel form-panel" onSubmit={submit}>
          <h3>
            01 <span>Reporter & incident details</span>
          </h3>
          <div className="form-grid">
            {[
              ["reporterName", "Reporter name"],
              ["contact", "Contact details"],
              ["aircraftRegistration", "Aircraft registration", "VT-ABC"],
              ["incidentCode", "Incident code", "GND123"],
            ].map(([k, label, placeholder]) => (
              <label key={k}>
                {label}
                <input
                  required
                  value={data[k]}
                  placeholder={placeholder}
                  onChange={(e) => edit(k, e.target.value)}
                />
              </label>
            ))}
            <label>
              Reporter ID
              <input value={user.userId} disabled />
            </label>
            <label>
              Carrier code
              <select
                value={data.carrierCode}
                onChange={(e) => edit("carrierCode", e.target.value)}
              >
                {["AI", "6E", "SG", "UK", "OTHER"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              Zone
              <input
                required
                value={data.zone}
                onChange={(e) => edit("zone", e.target.value)}
              />
            </label>
            <label>
              Incident date & time
              <input
                type="datetime-local"
                required
                value={data.occurredAt}
                onChange={(e) => edit("occurredAt", e.target.value)}
              />
            </label>
            <label>
              Urgency
              <select
                value={data.urgency}
                onChange={(e) => edit("urgency", e.target.value)}
              >
                {["Normal", "High", "Critical"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          </div>
          <h3>
            02 <span>What happened?</span>
          </h3>
          <label>
            Incident description
            <textarea
              required
              minLength={4}
              maxLength={5000}
              rows={5}
              placeholder="Describe the incident, location, and immediate concerns…"
              value={data.description}
              onChange={(e) => edit("description", e.target.value)}
            />
          </label>
          <label>
            Supporting attachment (optional · PNG, JPG or PDF · 5 MB)
            <input
              type="file"
              accept="image/png,image/jpeg,application/pdf"
              onChange={(e) => setFile(e.target.files[0])}
            />
          </label>
          <div className="form-actions">
            <button type="button" onClick={check}>
              Validate & classify
            </button>
            <button className="primary" disabled={busy}>
              {busy ? "Submitting…" : "Submit incident"}{" "}
              <ArrowUpRight size={17} />
            </button>
          </div>
        </form>
        <div>
          <section className="panel">
            <ShieldCheck className="blue" />
            <h3>Validation before dispatch</h3>
            <p>
              Aircraft and incident identifiers must pass both DFA and regex
              checks. Classification uses the authoritative Python service.
            </p>
            {result ? (
              <ValidationResult result={result} />
            ) : (
              <div className="info-note">
                Run validation to see the detected category and priority before
                submitting.
              </div>
            )}
          </section>
          <section className="panel">
            <h3>Reporting guidance</h3>
            <p>
              Use the carrier field for airline routing. A VT registration does
              not identify an airline.
            </p>
            <p>
              Unknown zones enter a correction queue. Critical urgency never
              bypasses validation.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
function ValidationResult({ result }) {
  return (
    <div>
      <div className="validation-outcome">
        <Badge>{result.valid ? "Accepted" : "Rejected"}</Badge>{" "}
        {result.category || "No category"} · Priority {result.priority}
      </div>
      {result.errors?.map((e) => (
        <p className="error" key={e}>
          {e}
        </p>
      ))}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Input</th>
              <th>DFA</th>
              <th>Regex</th>
              <th>Agreement</th>
            </tr>
          </thead>
          <tbody>
            {["aircraft", "code"].map((k) => (
              <tr key={k}>
                <td>{result[k].input || k}</td>
                <td>{result[k].accepted ? "Accept" : "Reject"}</td>
                <td>{result[k].regex ? "Accept" : "Reject"}</td>
                <td>{result[k].agreement ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted">
        Matched: {result.matchedCategories.join(", ") || "None"}
        <br />
        Rule: Safety-Breach → Damage → Equipment-Failure → FOD → Delay
      </p>
    </div>
  );
}
function Details() {
  const { id } = useParams(),
    load = useLoad(`/incidents/${id}`),
    { user, notify } = useContext(Context);
  async function transition(status) {
    try {
      await api.patch(`/incidents/${id}/status`, { status });
      notify("Status updated");
      load.reload();
    } catch (e) {
      notify(message(e), true);
    }
  }
  async function download() {
    try {
      const r = await api.get(`/incidents/${id}/attachment`, {
        responseType: "blob",
      });
      const u = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = u;
      a.download = "supporting-attachment";
      a.click();
      URL.revokeObjectURL(u);
    } catch (e) {
      notify(message(e), true);
    }
  }
  const r = load.data?.incident;
  return (
    <>
      <Title
        title={id}
        description="Incident record, dispatch decision, and complete response timeline."
      />
      <State load={load}>
        {r && (
          <div className="form-layout">
            <div>
              <section className="panel">
                <div className="section-heading">
                  <h3>{r.category}</h3>
                  <Badge>{r.status}</Badge>
                </div>
                <p className="description">{r.description}</p>
                <div className="detail-grid">
                  {[
                    ["Aircraft", r.aircraftRegistration],
                    ["Incident code", r.incidentCode],
                    ["Carrier / zone", `${r.carrierCode} / ${r.zone}`],
                    ["Priority", ["Critical", "High", "Normal"][r.priority]],
                    ["Reporter", r.reporterName],
                    ["Contact", r.contact],
                    ["Submitted", new Date(r.createdAt).toLocaleString()],
                    ["Handler", r.assignedHandler || "Unassigned"],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <small>{k}</small>
                      <strong>{v}</strong>
                    </div>
                  ))}
                </div>
                {r.attachment && (
                  <button onClick={download}>Download attachment</button>
                )}
              </section>
              <section className="panel">
                <h3>Dispatch decision</h3>
                <p>{r.routingDecision}</p>
                <ValidationResult result={r.validationResult} />
              </section>
              <section className="panel">
                <h3>Audit history</h3>
                {load.data.audit.map((a) => (
                  <div className="audit-row" key={a._id}>
                    <strong>{a.action}</strong>
                    <small>
                      {a.actorId} · {new Date(a.createdAt).toLocaleString()}
                    </small>
                  </div>
                ))}
              </section>
            </div>
            <section className="panel timeline">
              <h3>Response timeline</h3>
              {r.history.map((h, i) => (
                <div className="timeline-item" key={i}>
                  <i />
                  <strong>{h.status}</strong>
                  <small>{new Date(h.timestamp).toLocaleString()}</small>
                  <small>{h.actorId}</small>
                </div>
              ))}
              {["supervisor", "admin"].includes(user.role) &&
                ["Assigned", "In Progress"].includes(r.status) && (
                  <button
                    className="primary"
                    onClick={() =>
                      transition(
                        r.status === "Assigned" ? "In Progress" : "Resolved",
                      )
                    }
                  >
                    Mark {r.status === "Assigned" ? "In Progress" : "Resolved"}
                  </button>
                )}
            </section>
          </div>
        )}
      </State>
    </>
  );
}
function HandlerDashboard() {
  const load = useLoad("/handlers", []),
    reports = useLoad("/incidents", []),
    { notify } = useContext(Context);
  async function toggle(h) {
    try {
      await api.patch(`/handlers/${h.handlerId}/availability`, {
        availability: !h.available,
      });
      notify("Availability updated");
      load.reload();
      reports.reload();
    } catch (e) {
      notify(message(e), true);
    }
  }
  return (
    <>
      <Title
        title="My assignments"
        description="Your handling team's active reports, available capacity, and response actions."
      />
      <State load={load}>
        <div className="team-grid">
          {load.data.map((h) => (
            <section className="panel" key={h.handlerId}>
              <h3>{h.name}</h3>
              <p>
                {h.handlerId} · Home zone {h.zone}
              </p>
              <div className="capacity">
                <strong>
                  {h.currentLoad} / {h.capacity}
                </strong>
                <span>occupied slots</span>
              </div>
              <progress value={h.currentLoad} max={h.capacity} />
              <p>Available capacity: {h.capacity - h.currentLoad}</p>
              <Badge>{h.available ? "Available" : "Unavailable"}</Badge>
              <div className="form-actions">
                <button onClick={() => toggle(h)}>
                  Set {h.available ? "unavailable" : "available"}
                </button>
              </div>
            </section>
          ))}
        </div>
      </State>
      <section className="panel">
        <h3>Active assignments</h3>
        <p>Open a report to mark it In Progress or Resolved.</p>
        <State load={reports}>
          <IncidentTable
            rows={reports.data.filter(
              (r) => r.status === "Assigned" || r.status === "In Progress",
            )}
          />
        </State>
      </section>
    </>
  );
}
function Routing() {
  const routes = useLoad("/routing", []),
    handlers = useLoad("/handlers", []),
    queue = useLoad("/incidents?status=Pending", []),
    { user, notify } = useContext(Context),
    [editing, setEditing] = useState(null);
  async function action(url, data, method = "patch") {
    try {
      await api[method](url, data);
      notify("Dispatch configuration updated");
      routes.reload();
      handlers.reload();
      queue.reload();
      setEditing(null);
    } catch (e) {
      notify(message(e), true);
    }
  }
  return (
    <>
      <Title
        title="Dispatch & handling teams"
        description="Database-backed routes, live capacity, and the priority waiting queue."
      >
        {user.role === "admin" && (
          <button onClick={() => action("/routing/dispatch", {}, "post")}>
            <RefreshCw size={16} /> Retry queued reports
          </button>
        )}
      </Title>
      <div className="team-grid">
        <State load={handlers}>
          {handlers.data.map((h) => (
            <section className="panel" key={h.handlerId}>
              <div className="section-heading">
                <span className="zone">{h.zone}</span>
                <Badge>{h.available ? "Available" : "Unavailable"}</Badge>
              </div>
              <h3>{h.name}</h3>
              <p>
                {h.handlerId} · {h.teamId}
              </p>
              <div className="capacity">
                <strong>
                  {h.currentLoad}
                  <small> / {h.capacity}</small>
                </strong>
                <span>active assignments</span>
              </div>
              <progress value={h.currentLoad} max={h.capacity} />
              {["admin", "supervisor"].includes(user.role) && (
                <div className="form-actions">
                  <button
                    onClick={() =>
                      action(`/handlers/${h.handlerId}/availability`, {
                        availability: !h.available,
                      })
                    }
                  >
                    {h.available ? "Set unavailable" : "Set available"}
                  </button>
                  {user.role === "admin" && (
                    <label>
                      Capacity
                      <input
                        type="number"
                        min={Math.max(1, h.currentLoad)}
                        max="100"
                        defaultValue={h.capacity}
                        onBlur={(e) =>
                          Number(e.target.value) !== h.capacity &&
                          action(`/handlers/${h.handlerId}/capacity`, {
                            capacity: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  )}
                </div>
              )}
            </section>
          ))}
        </State>
      </div>
      <section className="panel">
        <h3>Airline routing table</h3>
        <p className="muted small">
          Fictional demonstration assignments. UK is a configurable legacy
          example.
        </p>
        <State load={routes}>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {[
                    "Carrier",
                    "Team",
                    "Zone",
                    "Supervisor",
                    "Backup",
                    "Escalation",
                    "",
                  ].map((x) => (
                    <th key={x}>{x}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {routes.data.map((r) => (
                  <tr key={r._id}>
                    <td>
                      <strong>{r.carrierCode}</strong>
                    </td>
                    <td>{r.teamName}</td>
                    <td>{r.zone}</td>
                    <td>{r.supervisor}</td>
                    <td>{r.backupTeamId}</td>
                    <td>{r.escalationAuthority}</td>
                    <td>
                      {user.role === "admin" && (
                        <button onClick={() => setEditing({ ...r })}>
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </State>
      </section>
      <section className="panel">
        <h3>Waiting & correction queue</h3>
        <State load={queue}>
          <IncidentTable rows={queue.data} />
          {queue.data.map((r) => (
            <p key={r.reportId} className="info-note">
              {r.reportId}: {r.routingDecision}
            </p>
          ))}
        </State>
      </section>
      {editing && (
        <div className="modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="route-title"
            className="panel modal"
          >
            <h2 id="route-title">Edit {editing.carrierCode} route</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                action(`/routing/${editing._id}`, editing);
              }}
            >
              {[
                "zone",
                "teamId",
                "backupTeamId",
                "supervisor",
                "escalationAuthority",
              ].map((k) => (
                <label key={k}>
                  {k}
                  <input
                    required
                    value={editing[k]}
                    onChange={(e) =>
                      setEditing({ ...editing, [k]: e.target.value })
                    }
                  />
                </label>
              ))}
              <div className="form-actions">
                <button type="button" onClick={() => setEditing(null)}>
                  Cancel
                </button>
                <button className="primary">Save route</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
function Analytics() {
  const [dates, setDates] = useState({ from: "", to: "" }),
    load = useLoad("/dashboard/analytics?" + new URLSearchParams(dates));
  return (
    <>
      <Title
        title="Incident analytics"
        description="Operational trends calculated from your permitted, stored reports."
      />
      <div className="filters">
        {["from", "to"].map((k) => (
          <label key={k}>
            {k}
            <input
              type="date"
              value={dates[k]}
              onChange={(e) => setDates({ ...dates, [k]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <State load={load}>
        {load.data && (
          <>
            <Metrics data={load.data} />
            <p className="info-note">
              Average resolution time:{" "}
              {load.data.averageResolutionMinutes.toFixed(1)} minutes
            </p>
            <div className="chart-grid">
              <Chart
                title="Incidents by category"
                data={load.data.categories}
              />
              <Chart title="Incidents by zone" data={load.data.zones} />
              <Chart
                title="Resolution overview"
                data={
                  load.data.total
                    ? [
                        { name: "Resolved", value: load.data.resolved },
                        { name: "Unresolved", value: load.data.unresolved },
                      ]
                    : []
                }
              />
              <Chart
                title="Incidents over time"
                data={[...load.data.timeline].sort((a, b) =>
                  a.name.localeCompare(b.name),
                )}
                line
              />
              <Chart
                title="Handler workload"
                data={load.data.workload.map((h) => ({
                  name: h.handlerId,
                  value: h.currentLoad,
                }))}
              />
              <Chart
                title="Priority distribution"
                data={load.data.priorities.map((p) => ({
                  ...p,
                  name: ["Critical", "High", "Normal"][p.name],
                }))}
              />
            </div>
          </>
        )}
      </State>
    </>
  );
}
function Safety() {
  const load = useLoad("/notifications", []),
    reports = useLoad("/incidents", []),
    { notify } = useContext(Context);
  return (
    <>
      <Title
        title="Safety center"
        description="Persisted safety notifications and critical incident escalations."
      />
      <section className="panel">
        <h3>Safety officer inbox</h3>
        <State load={load}>
          {!load.data.length ? (
            <div className="empty">
              <Bell />
              <p>No safety notifications.</p>
            </div>
          ) : (
            load.data.map((n) => (
              <div className="notification" key={n.notificationId}>
                <ShieldCheck className="blue" />
                <div>
                  <Link to={`/incidents/${n.reportId}`}>{n.reportId}</Link>
                  <p>
                    {n.demoDataset ? "[SYNTHETIC DEMO] " : ""}
                    {n.notificationType} · {n.deliveryStatus}
                  </p>
                  <small>{new Date(n.createdAt).toLocaleString()}</small>
                </div>
                <button
                  disabled={n.read}
                  onClick={async () => {
                    try {
                      await api.patch(
                        `/notifications/${n.notificationId}/read`,
                      );
                      load.reload();
                    } catch (e) {
                      notify(message(e), true);
                    }
                  }}
                >
                  {n.read ? "Read" : "Mark read"}
                </button>
              </div>
            ))
          )}
        </State>
      </section>
      <section className="panel">
        <h3>Safety & critical incidents</h3>
        <State load={reports}>
          <IncidentTable
            rows={reports.data.filter(
              (r) => r.category === "Safety-Breach" || r.priority === 0,
            )}
          />
        </State>
      </section>
    </>
  );
}
function Simulator({ demo = false }) {
  const [data, setData] = useState({
      aircraftRegistration: "VT-ABC",
      incidentCode: "GND123",
      description: "Foreign object debris found near aircraft.",
      urgency: "Normal",
    }),
    [result, setResult] = useState(null),
    [step, setStep] = useState(0),
    [kind, setKind] = useState("aircraft"),
    { notify } = useContext(Context);
  async function run() {
    try {
      setResult((await api.post("/validation/simulate", data)).data);
      setStep(0);
    } catch (e) {
      notify(message(e), true);
    }
  }
  const current =
    result?.[kind]?.trace[Math.min(step, result[kind].trace.length - 1)]?.state;
  return (
    <>
      <Title
        title={demo ? "Test demonstration" : "DFA simulator"}
        description="Explore genuine state transitions and compare independent DFA and regex results. No reports or audit records are written by this simulation."
      />
      <div className="form-layout">
        <section className="panel">
          <h3>Identifier laboratory</h3>
          {["aircraftRegistration", "incidentCode", "description"].map((k) => (
            <label key={k}>
              {k}
              <input
                value={data[k]}
                onChange={(e) => {
                  setData({ ...data, [k]: e.target.value });
                  setResult(null);
                }}
              />
            </label>
          ))}
          <label>
            Urgency
            <select
              value={data.urgency}
              onChange={(e) => setData({ ...data, urgency: e.target.value })}
            >
              {["Normal", "High", "Critical"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <button className="primary" onClick={run}>
            Run validators
          </button>
          {demo && (
            <div className="demo-examples">
              {[
                ["Malformed", "vt-abc", "debris"],
                [
                  "Safety override",
                  "VT-ABC",
                  "unsafe equipment damage near runway",
                ],
                ["Equipment", "VT-XYZ", "conveyor breakdown"],
                ["Unknown category", "VT-ABC", "routine inspection"],
              ].map(([label, aircraftRegistration, description]) => (
                <button
                  key={label}
                  onClick={() => {
                    setData({ ...data, aircraftRegistration, description });
                    setResult(null);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </section>
        <section className="panel">
          <h3>DFA vs regular expression</h3>
          {result ? (
            <ValidationResult result={result} />
          ) : (
            <div className="empty">
              Run a test to compare acceptance and rejection.
            </div>
          )}
        </section>
      </div>
      <section className="panel">
        <div className="section-heading">
          <h3>State-by-state simulation</h3>
          <select
            aria-label="Automaton"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setStep(0);
            }}
          >
            <option value="aircraft">Aircraft registration</option>
            <option value="code">Incident code</option>
          </select>
        </div>
        <p>
          {kind === "aircraft" ? "^VT-[A-Z]{3}$" : "^GND[0-9]{3}$"} · q0 starts
          · q6 accepts · unexpected input → dead state
        </p>
        <div className="dfa-scroll">
          <svg
            role="img"
            aria-label="DFA transition diagram"
            viewBox="0 0 860 185"
          >
            <defs>
              <marker
                id="arrow"
                markerWidth="7"
                markerHeight="7"
                refX="6"
                refY="3.5"
                orient="auto"
              >
                <path d="M0 0 L7 3.5 L0 7" fill="#71839b" />
              </marker>
            </defs>
            <path d="M0 65 L22 65" stroke="#71839b" markerEnd="url(#arrow)" />
            {Array.from({ length: 7 }, (_, i) => (
              <g key={i}>
                {i < 6 && (
                  <>
                    <line
                      x1={85 + i * 110}
                      y1="65"
                      x2={132 + i * 110}
                      y2="65"
                      stroke="#71839b"
                      markerEnd="url(#arrow)"
                    />
                    <text
                      x={108 + i * 110}
                      y="32"
                      textAnchor="middle"
                      fontSize="13"
                    >
                      {i < 3
                        ? (kind === "aircraft" ? "VT-" : "GND")[i]
                        : kind === "aircraft"
                          ? "A–Z"
                          : "0–9"}
                    </text>
                  </>
                )}
                <circle
                  cx={55 + i * 110}
                  cy="65"
                  r="30"
                  fill={current === `q${i}` ? "#dbeafe" : "#f5f8fc"}
                  stroke={current === `q${i}` ? "#2563eb" : "#71839b"}
                  strokeWidth="2"
                />
                {i === 6 && (
                  <circle
                    cx={55 + i * 110}
                    cy="65"
                    r="25"
                    fill="none"
                    stroke="#71839b"
                  />
                )}
                <text
                  x={55 + i * 110}
                  y="70"
                  textAnchor="middle"
                  fill="#172d47"
                >
                  q{i}
                </text>
              </g>
            ))}
            <circle
              cx="795"
              cy="140"
              r="28"
              fill={current === "dead" ? "#fee2e2" : "#f5f8fc"}
              stroke="#b45353"
            />
            <text x="795" y="145" textAnchor="middle">
              dead
            </text>
            <path
              d="M55 100 L55 140 L760 140"
              stroke="#b45353"
              strokeDasharray="5 4"
              fill="none"
              markerEnd="url(#arrow)"
            />
            <text x="365" y="130" fontSize="12">
              Unexpected transition from any state; dead loops on all input
            </text>
          </svg>
        </div>
        {result && (
          <>
            <input
              aria-label="Simulation step"
              type="range"
              min="0"
              max={result[kind].trace.length - 1}
              value={step}
              onChange={(e) => setStep(Number(e.target.value))}
            />
            <p>
              Step {step} · Character:{" "}
              {result[kind].trace[step]?.character || "start"} · Current state:{" "}
              <strong>{current}</strong>
            </p>
            <div className="trace">
              {result[kind].trace.map((s, i) => (
                <button
                  className={step === i ? "selected" : ""}
                  key={i}
                  onClick={() => setStep(i)}
                >
                  {s.character || "start"} → {s.state}
                </button>
              ))}
            </div>
          </>
        )}
      </section>
    </>
  );
}
function BusinessRules() {
  const load = useLoad("/admin/business-rules"),
    [value, setValue] = useState(null),
    { notify } = useContext(Context);
  return (
    <section className="panel">
      <h3>Supported identifiers & aircraft lookup</h3>
      <p>
        Empty lists allow all syntactically valid identifiers. Unknown routing
        keys still enter the correction queue.
      </p>
      <State load={load}>
        <textarea
          aria-label="Business rules JSON"
          rows={7}
          value={value ?? JSON.stringify(load.data, null, 2)}
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          onClick={async () => {
            try {
              await api.put(
                "/admin/business-rules",
                JSON.parse(value ?? JSON.stringify(load.data)),
              );
              notify("Business rules updated");
              load.reload();
            } catch (e) {
              notify(message(e), true);
            }
          }}
        >
          Save business rules
        </button>
      </State>
    </section>
  );
}
function Admin() {
  const users = useLoad("/admin/users", []),
    audit = useLoad("/admin/audit", []),
    settings = useLoad("/admin/settings"),
    [form, setForm] = useState({
      name: "",
      email: "",
      password: "",
      role: "staff",
      assignedTeam: "",
    }),
    [keywords, setKeywords] = useState(""),
    { notify } = useContext(Context);
  async function create(e) {
    e.preventDefault();
    try {
      await api.post("/admin/users", form);
      notify("User provisioned");
      setForm({ ...form, name: "", email: "", password: "" });
      users.reload();
      audit.reload();
    } catch (e) {
      notify(message(e), true);
    }
  }
  async function change(id, patch) {
    try {
      await api.patch(`/admin/users/${id}`, patch);
      users.reload();
      audit.reload();
      notify("Account updated");
    } catch (e) {
      notify(message(e), true);
    }
  }
  return (
    <>
      <Title
        title="Administration"
        description="Controlled staff provisioning, classification rules, and administrative audit history."
      />
      <div className="form-layout">
        <section className="panel">
          <h3>Provision an account</h3>
          <form onSubmit={create}>
            {["name", "email", "password", "assignedTeam"].map((k) => (
              <label key={k}>
                {k}
                {k === "assignedTeam" ? " (handler ID for supervisor)" : ""}
                <input
                  type={
                    k === "password"
                      ? "password"
                      : k === "email"
                        ? "email"
                        : "text"
                  }
                  required={k !== "assignedTeam"}
                  minLength={k === "password" ? 12 : 1}
                  value={form[k]}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                />
              </label>
            ))}
            <label>
              Role
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                {["staff", "supervisor", "safety", "admin"].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <button className="primary">Create account</button>
          </form>
        </section>
        <section className="panel">
          <h3>Classification keywords</h3>
          <p>
            JSON keyword arrays for exactly five categories. Changes are
            audited.
          </p>
          <textarea
            rows={13}
            aria-label="Classification keywords JSON"
            placeholder='{"FOD":["debris"],"Damage":["damage"],"Delay":["delay"],"Safety-Breach":["unsafe"],"Equipment-Failure":["malfunction"]}'
            value={
              keywords ||
              (settings.data?.value
                ? JSON.stringify(settings.data.value, null, 2)
                : "")
            }
            onChange={(e) => setKeywords(e.target.value)}
          />
          <button
            onClick={async () => {
              try {
                await api.put(
                  "/admin/settings",
                  JSON.parse(keywords || JSON.stringify(settings.data?.value)),
                );
                notify("Keywords updated");
                settings.reload();
                audit.reload();
              } catch (e) {
                notify(message(e), true);
              }
            }}
          >
            Save keywords
          </button>
        </section>
      </div>
      <BusinessRules />
      <section className="panel">
        <h3>Accounts & roles</h3>
        <State load={users}>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Handler</th>
                  <th>Access</th>
                </tr>
              </thead>
              <tbody>
                {users.data.map((u) => (
                  <tr key={u.userId}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>
                      <select
                        aria-label={`Role for ${u.name}`}
                        value={u.role}
                        onChange={(e) =>
                          change(u.userId, { role: e.target.value })
                        }
                      >
                        {["staff", "supervisor", "safety", "admin"].map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        aria-label={`Handler for ${u.name}`}
                        defaultValue={u.assignedTeam || ""}
                        onBlur={(e) =>
                          e.target.value !== u.assignedTeam &&
                          change(u.userId, { assignedTeam: e.target.value })
                        }
                      />
                    </td>
                    <td>
                      <button
                        onClick={() => change(u.userId, { active: !u.active })}
                      >
                        {u.active ? "Disable" : "Enable"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </State>
      </section>
      <section className="panel">
        <h3>Audit log</h3>
        <State load={audit}>
          {audit.data.map((a) => (
            <details key={a._id} className="audit-row">
              <summary>
                {a.action} · {a.reportId || a.actorId} ·{" "}
                {new Date(a.createdAt).toLocaleString()}
              </summary>
              <pre>
                {JSON.stringify(
                  { previous: a.previousValue, value: a.newValue },
                  null,
                  2,
                )}
              </pre>
            </details>
          ))}
        </State>
      </section>
    </>
  );
}
function App() {
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true),
    [toast, setToast] = useState(null);
  function notify(text, error = false) {
    setToast({ text, error });
    setTimeout(() => setToast(null), 6000);
  }
  useEffect(() => {
    if (sessionStorage.getItem("agil-token"))
      api
        .get("/auth/me")
        .then((r) => setUser(r.data))
        .catch(() => sessionStorage.removeItem("agil-token"))
        .finally(() => setLoading(false));
    else setLoading(false);
  }, []);
  return (
    <Context.Provider value={{ user, setUser, notify }}>
      <BrowserRouter>
        {loading ? (
          <div className="empty">Opening workspace…</div>
        ) : user ? (
          <Shell />
        ) : (
          <Login />
        )}
        {toast && (
          <div role="alert" className={`toast ${toast.error ? "error" : ""}`}>
            {toast.text}
            <button
              aria-label="Dismiss notification"
              onClick={() => setToast(null)}
            >
              ×
            </button>
          </div>
        )}
      </BrowserRouter>
    </Context.Provider>
  );
}
createRoot(document.getElementById("root")).render(<App />);
