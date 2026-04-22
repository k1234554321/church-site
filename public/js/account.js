(function () {
  var TOKEN_KEY = "prichod_token";
  var NAME_KEY = "prichod_name";

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function getName() { return localStorage.getItem(NAME_KEY); }

  function saveAuth(token, name) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(NAME_KEY, name);
  }

  function clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(NAME_KEY);
  }

  function authHeaders() {
    return { "Content-Type": "application/json", "Authorization": "Bearer " + getToken() };
  }

  function setStatus(id, text, ok) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.className = "status " + (ok === true ? "ok" : ok === false ? "err" : "");
  }

  function formatDate(d) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function formatAmount(n) {
    return Number(n).toLocaleString("ru-RU", { minimumFractionDigits: 0 }) + " ₽";
  }

  var NOTE_STATUS = { new: "Новая", processing: "Принята", done: "Выполнена" };
  var NOTE_BADGE = { new: "badge-new", processing: "badge-processing", done: "badge-done" };

  function showCabinet(name, email) {
    document.getElementById("auth-section").style.display = "none";
    document.getElementById("cabinet-section").style.display = "";
    document.getElementById("user-name-display").textContent = name;
    document.getElementById("user-email-display").textContent = email || "";
    var av = document.getElementById("user-avatar");
    if (av) av.textContent = (name || "?")[0].toUpperCase();
  }

  function showAuth() {
    document.getElementById("auth-section").style.display = "";
    document.getElementById("cabinet-section").style.display = "none";
  }

  // ── Tabs ─────────────────────────────────────────────────
  function initTabs() {
    document.querySelectorAll(".tab-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var tab = btn.getAttribute("data-tab");
        document.querySelectorAll(".tab-btn").forEach(function (b) { b.classList.remove("active"); });
        document.querySelectorAll(".tab-panel").forEach(function (p) { p.classList.remove("active"); });
        btn.classList.add("active");
        var panel = document.getElementById("tab-" + tab);
        if (panel) panel.classList.add("active");
        if (tab === "notes") loadNotes();
        if (tab === "donations") loadDonations();
        if (tab === "profile") loadProfile();
      });
    });
  }

  // ── Notes ─────────────────────────────────────────────────
  function loadNotes() {
    var box = document.getElementById("notes-list");
    box.innerHTML = "<p class='muted'>Загрузка…</p>";
    fetch("/api/account/notes", { headers: authHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var items = data.items || [];
        if (!items.length) { box.innerHTML = "<p class='empty-state'>Записок пока нет.<br>Вы можете <a href='/notes.html'>подать записку</a>.</p>"; return; }
        var html = '<div style="overflow-x:auto;"><table class="history-table"><thead><tr><th>Дата</th><th>Имена</th><th>Вид</th><th>Срок</th><th>Статус</th></tr></thead><tbody>';
        items.forEach(function (it) {
          var badgeCls = NOTE_BADGE[it.status] || "badge-new";
          var statusLabel = NOTE_STATUS[it.status] || it.status;
          html += "<tr><td>" + formatDate(it.created_at) + "</td><td style='max-width:200px;'>" + esc(it.names) + "</td><td>" + esc(it.note_type) + "</td><td>" + (esc(it.served_for) || "—") + "</td><td><span class='badge " + badgeCls + "'>" + statusLabel + "</span></td></tr>";
        });
        html += "</tbody></table></div>";
        box.innerHTML = html;
      })
      .catch(function () { box.innerHTML = "<p class='status err'>Ошибка загрузки. Сервер недоступен.</p>"; });
  }

  // ── Donations ─────────────────────────────────────────────
  function loadDonations() {
    var box = document.getElementById("donations-list");
    box.innerHTML = "<p class='muted'>Загрузка…</p>";
    fetch("/api/account/donations", { headers: authHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var items = data.items || [];
        if (!items.length) { box.innerHTML = "<p class='empty-state'>Пожертвований пока нет.<br><a href='/donate.html'>Сделать пожертвование</a>.</p>"; return; }
        var total = items.reduce(function (s, it) { return s + parseFloat(it.amount || 0); }, 0);
        var html = '<p style="margin-bottom:.75rem;color:var(--muted);font-size:.9rem;">Итого: <strong style="color:var(--navy)">' + formatAmount(total) + '</strong></p>';
        html += '<div style="overflow-x:auto;"><table class="history-table"><thead><tr><th>Дата</th><th>Сумма</th><th>Назначение</th><th>Примечание</th></tr></thead><tbody>';
        items.forEach(function (it) {
          html += "<tr><td>" + formatDate(it.created_at) + "</td><td><strong>" + formatAmount(it.amount) + "</strong></td><td>" + esc(it.purpose) + "</td><td style='max-width:200px;color:var(--muted);font-size:.85rem;'>" + (esc(it.message) || "—") + "</td></tr>";
        });
        html += "</tbody></table></div>";
        box.innerHTML = html;
      })
      .catch(function () { box.innerHTML = "<p class='status err'>Ошибка загрузки.</p>"; });
  }

  // ── Profile ───────────────────────────────────────────────
  function loadProfile() {
    fetch("/api/account/profile", { headers: authHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (user) {
        var form = document.getElementById("form-profile");
        if (!form) return;
        form.querySelector('[name="name"]').value = user.name || "";
        form.querySelector('[name="phone"]').value = user.phone || "";
        form.querySelector('[name="email"]').value = user.email || "";
        form.querySelector('[name="news_subscribe"]').checked = !!user.news_subscribe;
      })
      .catch(function () { setStatus("profile-status", "Ошибка загрузки профиля.", false); });
  }

  // ── Escape ────────────────────────────────────────────────
  function esc(str) {
    return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // ── Init ──────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", function () {
    initTabs();

    // Переключение форм входа/регистрации
    var goReg = document.getElementById("go-register");
    var goLog = document.getElementById("go-login");
    var loginBlock = document.getElementById("login-block");
    var registerBlock = document.getElementById("register-block");

    if (goReg) goReg.addEventListener("click", function () {
      loginBlock.style.display = "none";
      registerBlock.style.display = "";
    });
    if (goLog) goLog.addEventListener("click", function () {
      loginBlock.style.display = "";
      registerBlock.style.display = "none";
    });

    // Если уже авторизован — проверяем токен
    var token = getToken();
    if (token) {
      fetch("/api/account/profile", { headers: authHeaders() })
        .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
        .then(function (user) {
          saveAuth(token, user.name);
          showCabinet(user.name, user.email);
          loadNotes();
        })
        .catch(function () { clearAuth(); showAuth(); });
    } else {
      showAuth();
    }

    // Форма входа
    var formLogin = document.getElementById("form-login");
    if (formLogin) {
      formLogin.addEventListener("submit", async function (ev) {
        ev.preventDefault();
        setStatus("login-status", "Входим…", null);
        var fd = new FormData(formLogin);
        try {
          var r = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: fd.get("email"), password: fd.get("password") }),
          });
          var d = await r.json();
          if (!r.ok) throw new Error(d.error || "Ошибка");
          saveAuth(d.token, d.name);
          showCabinet(d.name, fd.get("email"));
          loadNotes();
        } catch (e) {
          setStatus("login-status", e.message, false);
        }
      });
    }

    // Форма регистрации
    var formReg = document.getElementById("form-register");
    if (formReg) {
      formReg.addEventListener("submit", async function (ev) {
        ev.preventDefault();
        setStatus("register-status", "Создаём аккаунт…", null);
        var fd = new FormData(formReg);
        try {
          var r = await fetch("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: fd.get("name"), email: fd.get("email"), password: fd.get("password"), phone: fd.get("phone") }),
          });
          var d = await r.json();
          if (!r.ok) throw new Error(d.error || "Ошибка");
          saveAuth(d.token, d.name);
          showCabinet(d.name, fd.get("email"));
          loadNotes();
        } catch (e) {
          setStatus("register-status", e.message, false);
        }
      });
    }

    // Профиль
    var formProfile = document.getElementById("form-profile");
    if (formProfile) {
      formProfile.addEventListener("submit", async function (ev) {
        ev.preventDefault();
        setStatus("profile-status", "Сохранение…", null);
        var fd = new FormData(formProfile);
        try {
          var r = await fetch("/api/account/profile", {
            method: "PUT",
            headers: authHeaders(),
            body: JSON.stringify({ name: fd.get("name"), phone: fd.get("phone"), news_subscribe: fd.get("news_subscribe") === "on" }),
          });
          var d = await r.json();
          if (!r.ok) throw new Error(d.error || "Ошибка");
          setStatus("profile-status", "Сохранено!", true);
          var newName = fd.get("name");
          if (newName) {
            localStorage.setItem(NAME_KEY, newName);
            document.getElementById("user-name-display").textContent = newName;
            var av = document.getElementById("user-avatar");
            if (av) av.textContent = newName[0].toUpperCase();
          }
        } catch (e) {
          setStatus("profile-status", e.message, false);
        }
      });
    }

    // Выход
    var logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", function () {
        clearAuth();
        showAuth();
      });
    }
  });
})();
