import { useEffect, useMemo, useState } from "react";
import {
  API_BASE_URL,
  apiRequest,
  clearStoredAuth,
  getStoredAuth,
  normalizeAuthPayload,
  normalizeCoursesPayload,
  normalizeDashboardPayload,
  setStoredAuth
} from "./lib/api";

const VIEW_OPTIONS = ["overview", "courses", "account"];

const LOGIN_FORM = {
  email: "",
  password: ""
};

const REGISTER_FORM = {
  name: "",
  email: "",
  password: "",
  phoneNumber: "",
  address: ""
};

const INITIAL_NOTICE =
  "Use the login form to connect to the live API. New registrations can be created here if the backend accepts them.";

function App() {
  const [auth, setAuth] = useState(() => getStoredAuth());
  const [profile, setProfile] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [courses, setCourses] = useState([]);
  const [view, setView] = useState("overview");
  const [authMode, setAuthMode] = useState("login");
  const [loading, setLoading] = useState(Boolean(getStoredAuth()?.accessToken));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(INITIAL_NOTICE);
  const [loginForm, setLoginForm] = useState(LOGIN_FORM);
  const [registerForm, setRegisterForm] = useState(REGISTER_FORM);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!auth?.accessToken || !auth?.user?.role) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const role = String(auth.user.role).toLowerCase();
        const [profilePayload, dashboardPayload, coursesPayload] = await Promise.all([
          apiRequest("/auth/profile", { token: auth.accessToken }),
          apiRequest(`/dashboard/${role}`, { token: auth.accessToken }),
          apiRequest("/courses?limit=12")
        ]);

        if (cancelled) {
          return;
        }

        setProfile(profilePayload?.data ?? profilePayload ?? null);
        setDashboard(normalizeDashboardPayload(dashboardPayload));
        setCourses(normalizeCoursesPayload(coursesPayload));
        setNotice(`Connected as ${auth.user.name}.`);
        setError("");
      } catch (requestError) {
        if (cancelled) {
          return;
        }

        clearStoredAuth();
        setAuth(null);
        setProfile(null);
        setDashboard(null);
        setCourses([]);
        setError(requestError.message);
        setNotice("Your session expired. Sign in again to continue.");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [auth?.accessToken, auth?.user?.role, auth?.user?.name]);

  const visibleCourses = useMemo(() => {
    const trimmedSearch = searchTerm.trim().toLowerCase();

    if (!trimmedSearch) {
      return courses;
    }

    return courses.filter((course) => {
      const haystack = [
        course.title,
        course.category,
        course.level,
        course.status,
        course.creator?.name,
        course.description
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(trimmedSearch);
    });
  }, [courses, searchTerm]);

  const metricCards = useMemo(() => {
    if (!dashboard) {
      return [];
    }

    const role = auth?.user?.role;

    if (role === "ADMIN") {
      return [
        ["Total users", dashboard.totalUsers],
        ["Students", dashboard.totalStudents],
        ["Instructors", dashboard.totalInstructors],
        ["Active accounts", dashboard.activeUsers],
        ["Blocked users", dashboard.blockedUsers],
        ["Courses", dashboard.totalCourses],
        ["Published", dashboard.publishedCourses],
        ["Enrollments", dashboard.totalEnrollments]
      ];
    }

    if (role === "INSTRUCTOR") {
      return [
        ["My courses", dashboard.totalCourses],
        ["Published", dashboard.publishedCourses],
        ["Drafts", dashboard.draftCourses],
        ["Students", dashboard.totalStudents],
        ["Modules", dashboard.totalModules],
        ["Quizzes", dashboard.totalQuizzes]
      ];
    }

    return [
      ["Enrolled courses", dashboard.enrolledCourses],
      ["Completed lessons", dashboard.completedLessons],
      ["Certificates", dashboard.certificates],
      ["Completion rate", `${dashboard.completionRate}%`]
    ];
  }, [auth?.user?.role, dashboard]);

  async function handleLoginSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const payload = await apiRequest("/auth/login", {
        method: "POST",
        body: loginForm
      });

      const authPayload = normalizeAuthPayload(payload);

      if (!authPayload?.accessToken) {
        throw new Error("Login response did not include an access token.");
      }

      setStoredAuth(authPayload);
      setAuth(authPayload);
      setProfile(authPayload.user ?? null);
      setNotice(`Signed in as ${authPayload.user?.name || authPayload.user?.email}.`);
      setView("overview");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRegisterSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");

    try {
      await apiRequest("/auth/register", {
        method: "POST",
        body: registerForm
      });

      setNotice("Registration completed. Sign in with the same email to continue.");
      setAuthMode("login");
      setLoginForm((currentForm) => ({
        ...currentForm,
        email: registerForm.email
      }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    if (!auth?.accessToken || !auth?.user?.id) {
      clearStoredAuth();
      setAuth(null);
      setProfile(null);
      setDashboard(null);
      setCourses([]);
      setNotice(INITIAL_NOTICE);
      return;
    }

    try {
      await apiRequest("/auth/logout", {
        method: "POST",
        token: auth.accessToken
      });
    } catch {
      // Clear locally even if the server-side logout fails.
    } finally {
      clearStoredAuth();
      setAuth(null);
      setProfile(null);
      setDashboard(null);
      setCourses([]);
      setSearchTerm("");
      setView("overview");
      setNotice(INITIAL_NOTICE);
    }
  }

  async function refreshPrivateData() {
    if (!auth?.accessToken || !auth?.user?.role) {
      return;
    }

    try {
      setLoading(true);
      const role = String(auth.user.role).toLowerCase();
      const [profilePayload, dashboardPayload, coursesPayload] = await Promise.all([
        apiRequest("/auth/profile", { token: auth.accessToken }),
        apiRequest(`/dashboard/${role}`, { token: auth.accessToken }),
        apiRequest("/courses?limit=12")
      ]);

      setProfile(profilePayload?.data ?? profilePayload ?? null);
      setDashboard(normalizeDashboardPayload(dashboardPayload));
      setCourses(normalizeCoursesPayload(coursesPayload));
      setError("");
      setNotice("Dashboard refreshed.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  const roleLabel = auth?.user?.role || profile?.role || "Guest";

  if (loading && auth?.accessToken) {
    return <LoadingScreen />;
  }

  if (!auth?.accessToken) {
    return (
      <LandingPage
        authMode={authMode}
        loginForm={loginForm}
        registerForm={registerForm}
        onLoginSubmit={handleLoginSubmit}
        onRegisterSubmit={handleRegisterSubmit}
        onLoginChange={setLoginForm}
        onRegisterChange={setRegisterForm}
        onToggleMode={setAuthMode}
        saving={saving}
        error={error}
        notice={notice}
        apiBaseUrl={API_BASE_URL}
      />
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">OT</div>
          <div>
            <p className="eyebrow">Orange Tree LMS</p>
            <h1>Learning operations panel</h1>
          </div>
        </div>

        <div className="sidebar-card">
          <span className="sidebar-label">Connected API</span>
          <strong>{API_BASE_URL}</strong>
          <p>Backend route groupings are already wired into the client.</p>
        </div>

        <nav className="sidebar-nav" aria-label="Primary">
          {VIEW_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className={option === view ? "nav-button active" : "nav-button"}
              onClick={() => setView(option)}
            >
              {option}
            </button>
          ))}
        </nav>

        <button type="button" className="logout-button" onClick={handleLogout}>
          Sign out
        </button>
      </aside>

      <main className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">Signed in as {roleLabel}</p>
            <h2>{auth.user?.name || profile?.name || "Orange Tree user"}</h2>
            <p className="muted-text">
              {notice || "Your dashboard is backed by live API responses."}
            </p>
          </div>

          <div className="header-actions">
            <button type="button" className="ghost-button" onClick={refreshPrivateData}>
              Refresh data
            </button>
            <div className="avatar-chip">{(auth.user?.name || profile?.name || "U").slice(0, 1)}</div>
          </div>
        </header>

        {error ? <div className="alert error">{error}</div> : null}

        {view === "overview" ? (
          <section className="stacked-grid">
            <section className="hero-panel">
              <div>
                <p className="eyebrow">Overview</p>
                <h3>Everything that matters, in one view.</h3>
                <p>
                  The frontend reads auth, dashboard, and course endpoints directly from the
                  Express backend. Login once, then switch views without losing context.
                </p>
              </div>
              <div className="hero-metrics">
                <div className="hero-tile">
                  <span>Status</span>
                  <strong>{auth.user?.status || profile?.status || "ACTIVE"}</strong>
                </div>
                <div className="hero-tile">
                  <span>Role</span>
                  <strong>{roleLabel}</strong>
                </div>
                <div className="hero-tile accent">
                  <span>Token</span>
                  <strong>{auth.accessToken ? "Stored locally" : "Missing"}</strong>
                </div>
              </div>
            </section>

            <section className="metric-grid">
              {metricCards.map(([label, value]) => (
                <article key={label} className="metric-card">
                  <span>{label}</span>
                  <strong>{value ?? 0}</strong>
                </article>
              ))}
            </section>

            <section className="content-grid">
              <article className="panel">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Recent context</p>
                    <h4>Profile snapshot</h4>
                  </div>
                </div>

                <dl className="definition-list">
                  <div>
                    <dt>Name</dt>
                    <dd>{profile?.name || auth.user?.name || "Unavailable"}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{profile?.email || auth.user?.email || "Unavailable"}</dd>
                  </div>
                  <div>
                    <dt>Role</dt>
                    <dd>{profile?.role || auth.user?.role || "Unavailable"}</dd>
                  </div>
                  <div>
                    <dt>Phone</dt>
                    <dd>{profile?.phoneNumber || "Not set"}</dd>
                  </div>
                  <div>
                    <dt>Address</dt>
                    <dd>{profile?.address || "Not set"}</dd>
                  </div>
                </dl>
              </article>

              <article className="panel">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Live feed</p>
                    <h4>API contract</h4>
                  </div>
                </div>

                <ul className="bullet-list">
                  <li>/auth/login returns access and refresh tokens.</li>
                  <li>/auth/profile confirms the stored token before showing private data.</li>
                  <li>/dashboard/{String(roleLabel).toLowerCase()} returns role-based metrics.</li>
                  <li>/courses powers the public catalog grid.</li>
                </ul>
              </article>
            </section>
          </section>
        ) : null}

        {view === "courses" ? (
          <section className="courses-view">
            <div className="section-toolbar">
              <div>
                <p className="eyebrow">Course catalog</p>
                <h3>Explore the current inventory</h3>
              </div>
              <label className="search-field">
                <span>Search</span>
                <input
                  type="search"
                  placeholder="Title, category, creator, level"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </label>
            </div>

            <div className="course-grid">
              {visibleCourses.length ? (
                visibleCourses.map((course) => (
                  <article key={course.id} className="course-card">
                    <div className="course-visual">
                      {course.thumbnailUrl ? (
                        <img src={course.thumbnailUrl} alt={course.title} />
                      ) : (
                        <div className="course-fallback">{course.title.slice(0, 2).toUpperCase()}</div>
                      )}
                      <span className={`status-pill ${String(course.status || "DRAFT").toLowerCase()}`}>
                        {course.status || "DRAFT"}
                      </span>
                    </div>

                    <div className="course-body">
                      <div className="course-meta">
                        <span>{course.category || "General"}</span>
                        <span>{course.level || "All levels"}</span>
                      </div>
                      <h4>{course.title}</h4>
                      <p>{course.description || "No description was provided for this course yet."}</p>

                      <div className="course-footer">
                        <div>
                          <span className="muted-label">Creator</span>
                          <strong>{course.creator?.name || "Unknown"}</strong>
                        </div>
                        <div>
                          <span className="muted-label">Published</span>
                          <strong>{formatDate(course.publishedAt || course.createdAt)}</strong>
                        </div>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <div className="empty-state">
                  <h4>No matching courses</h4>
                  <p>Try a different search term or refresh the data.</p>
                </div>
              )}
            </div>
          </section>
        ) : null}

        {view === "account" ? (
          <section className="content-grid account-grid">
            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Account</p>
                  <h4>Session details</h4>
                </div>
              </div>

              <dl className="definition-list compact">
                <div>
                  <dt>User id</dt>
                  <dd>{auth.user?.id || profile?.id || "Unavailable"}</dd>
                </div>
                <div>
                  <dt>Access token</dt>
                  <dd>{maskToken(auth.accessToken)}</dd>
                </div>
                <div>
                  <dt>Refresh token</dt>
                  <dd>{maskToken(auth.refreshToken)}</dd>
                </div>
              </dl>
            </article>

            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Actions</p>
                  <h4>What to do next</h4>
                </div>
              </div>

              <ul className="bullet-list">
                <li>Use the admin dashboard to monitor users and courses.</li>
                <li>Use the instructor dashboard to track your course workload.</li>
                <li>Use the course catalog to validate public content and thumbnails.</li>
              </ul>
            </article>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function LandingPage({
  authMode,
  loginForm,
  registerForm,
  onLoginSubmit,
  onRegisterSubmit,
  onLoginChange,
  onRegisterChange,
  onToggleMode,
  saving,
  error,
  notice,
  apiBaseUrl
}) {
  return (
    <div className="landing-layout">
      <section className="landing-hero">
        <div className="brand-lockup large">
          <div className="brand-mark">OT</div>
          <div>
            <p className="eyebrow">Orange Tree LMS</p>
            <h1>Built for course operations, not demo clutter.</h1>
          </div>
        </div>

        <p className="landing-copy">
          This frontend is wired to the Express backend, with login, registration, profile
          restoration, role dashboards, and course browsing already connected.
        </p>

        <div className="feature-grid">
          <article>
            <strong>Role aware</strong>
            <span>Admin, instructor, and student dashboards render from the live API.</span>
          </article>
          <article>
            <strong>Session safe</strong>
            <span>Access tokens are stored locally and verified against /auth/profile.</span>
          </article>
          <article>
            <strong>Course ready</strong>
            <span>The catalog handles title, status, creator, level, category, and thumbnails.</span>
          </article>
        </div>

        <div className="api-note">
          <span>API base URL</span>
          <strong>{apiBaseUrl}</strong>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-tabs">
          <button
            type="button"
            className={authMode === "login" ? "tab-button active" : "tab-button"}
            onClick={() => onToggleMode("login")}
          >
            Login
          </button>
          <button
            type="button"
            className={authMode === "register" ? "tab-button active" : "tab-button"}
            onClick={() => onToggleMode("register")}
          >
            Register
          </button>
        </div>

        {authMode === "login" ? (
          <form className="auth-form" onSubmit={onLoginSubmit}>
            <h2>Sign in</h2>
            <p>Use the email and password stored in the LMS database.</p>

            <label>
              Email
              <input
                type="email"
                value={loginForm.email}
                onChange={(event) => onLoginChange({ ...loginForm, email: event.target.value })}
                required
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={loginForm.password}
                onChange={(event) => onLoginChange({ ...loginForm, password: event.target.value })}
                required
              />
            </label>

            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? "Signing in..." : "Sign in"}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={onRegisterSubmit}>
            <h2>Create account</h2>
            <p>Registration is connected to the backend user creation route.</p>

            <label>
              Name
              <input
                type="text"
                value={registerForm.name}
                onChange={(event) => onRegisterChange({ ...registerForm, name: event.target.value })}
                required
              />
            </label>

            <label>
              Email
              <input
                type="email"
                value={registerForm.email}
                onChange={(event) => onRegisterChange({ ...registerForm, email: event.target.value })}
                required
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={registerForm.password}
                onChange={(event) => onRegisterChange({ ...registerForm, password: event.target.value })}
                required
              />
            </label>

            <label>
              Phone number
              <input
                type="tel"
                value={registerForm.phoneNumber}
                onChange={(event) =>
                  onRegisterChange({ ...registerForm, phoneNumber: event.target.value })
                }
              />
            </label>

            <label>
              Address
              <textarea
                rows="3"
                value={registerForm.address}
                onChange={(event) => onRegisterChange({ ...registerForm, address: event.target.value })}
              />
            </label>

            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? "Creating account..." : "Create account"}
            </button>
          </form>
        )}

        {notice ? <div className="alert notice">{notice}</div> : null}
        {error ? <div className="alert error">{error}</div> : null}
      </section>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-card">
        <div className="brand-mark">OT</div>
        <p>Loading secure session...</p>
      </div>
    </div>
  );
}

function formatDate(value) {
  if (!value) {
    return "Unknown";
  }

  const dateValue = new Date(value);

  if (Number.isNaN(dateValue.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(dateValue);
}

function maskToken(token) {
  if (!token) {
    return "Unavailable";
  }

  if (token.length < 10) {
    return token;
  }

  return `${token.slice(0, 5)}…${token.slice(-5)}`;
}

export default App;
