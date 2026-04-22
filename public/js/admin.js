(function () {
  var ADMIN_TOKEN_KEY = "prichod_admin_token";

  function getToken() { return localStorage.getItem(ADMIN_TOKEN_KEY); }
  function saveToken(t) { localStorage.setItem(ADMIN_TOKEN_KEY, t); }
  function clearToken() { localStorage.removeItem(ADMIN_TOKEN_KEY); }

  function headers() {
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
    return new Date(d).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function formatAmount(n) {
    return Number(n).toLocaleString("ru-RU", { minimumFractionDigits: 0 }) + " ₽";
  }

  function esc(str) {
    return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  var NOTE_STATUS = { new: "Новая", processing: "Принята", done: "Выполнена" };
  var NOTE_BADGE = { new: "badge-new", processing: "badge-processing", done: "badge-done" };

  // ── Stats ─────────────────────────────────────────────────
  function loadStats() {
    fetch("/api/admin/stats", { headers: headers() })
      .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function (d) {
        document.getElementById("stat-notes").textContent = d.notesCount;
        document.getElementById("stat-notes-new").textContent = d.notesNew;
        document.getElementById("stat-donations").textContent = d.donationsCount;
        document.getElementById("stat-donations-sum").textContent = d.donationsSum ? formatAmount(d.donationsSum) : "0 ₽";
        document.getElementById("stat-users").textContent = d.usersCount;
      })
      .catch(function () {});
  }

  // ── Notes ─────────────────────────────────────────────────
  var notesPage = 1;

  function loadNotes(page) {
    page = page || 1;
    notesPage = page;
    var filter = document.getElementById("notes-filter");
    var status = filter ? filter.value : "";
    var url = "/api/admin/notes?page=" + page + (status ? "&status=" + encodeURIComponent(status) : "");
    var tbody = document.getElementById("notes-tbody");
    tbody.innerHTML = '<tr><td colspan="8" class="muted" style="text-align:center;padding:1.5rem;">Загрузка…</td></tr>';
    fetch(url, { headers: headers() })
      .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function (data) {
        var items = data.items || [];
        if (!items.length) {
          tbody.innerHTML = '<tr><td colspan="8" class="muted" style="text-align:center;padding:1.5rem;">Записок нет.</td></tr>';
          renderPager("notes-pager", data.page, data.total, data.limit, loadNotes);
          return;
        }
        tbody.innerHTML = items.map(function (it) {
          var badgeCls = NOTE_BADGE[it.status] || "badge-new";
          var statusLabel = NOTE_STATUS[it.status] || it.status;
          return '<tr data-id="' + it.id + '">' +
            "<td style='white-space:nowrap;'>" + formatDate(it.created_at) + "</td>" +
            "<td style='max-width:180px;'>" + esc(it.names) + "</td>" +
            "<td>" + esc(it.note_type) + "</td>" +
            "<td>" + (esc(it.served_for) || "—") + "</td>" +
            "<td>" + (esc(it.contact) || "—") + "</td>" +
            "<td>" + (esc(it.user_name) || "<span class='muted'>Аноним</span>") + "</td>" +
            "<td><select class='note-status-sel' data-id='" + it.id + "' style='font-size:.8rem;padding:.2rem .4rem;border-radius:6px;border:1px solid rgba(30,45,61,.2);background:var(--surface);'>" +
              '<option value="new"' + (it.status === "new" ? " selected" : "") + ">Новая</option>" +
              '<option value="processing"' + (it.status === "processing" ? " selected" : "") + ">Принята</option>" +
              '<option value="done"' + (it.status === "done" ? " selected" : "") + ">Выполнена</option>" +
            "</select></td>" +
            "<td><button class='btn-icon btn-danger note-del' data-id='" + it.id + "' title='Удалить'>🗑</button></td>" +
            "</tr>";
        }).join("");
        renderPager("notes-pager", data.page, data.total, data.limit, loadNotes);

        // Смена статуса
        tbody.querySelectorAll(".note-status-sel").forEach(function (sel) {
          sel.addEventListener("change", function () {
            var id = sel.getAttribute("data-id");
            fetch("/api/admin/notes/" + id, {
              method: "PATCH", headers: headers(),
              body: JSON.stringify({ status: sel.value })
            }).catch(function () { alert("Ошибка обновления статуса."); });
          });
        });

        // Удаление
        tbody.querySelectorAll(".note-del").forEach(function (btn) {
          btn.addEventListener("click", function () {
            if (!confirm("Удалить записку?")) return;
            var id = btn.getAttribute("data-id");
            fetch("/api/admin/notes/" + id, { method: "DELETE", headers: headers() })
              .then(function () { loadNotes(notesPage); loadStats(); })
              .catch(function () { alert("Ошибка удаления."); });
          });
        });
      })
      .catch(function () { tbody.innerHTML = '<tr><td colspan="8" class="status err" style="padding:1rem;">Ошибка загрузки.</td></tr>'; });
  }

  // ── Donations ─────────────────────────────────────────────
  var donationsPage = 1;

  function loadDonations(page) {
    page = page || 1;
    donationsPage = page;
    var tbody = document.getElementById("donations-tbody");
    tbody.innerHTML = '<tr><td colspan="7" class="muted" style="text-align:center;padding:1.5rem;">Загрузка…</td></tr>';
    fetch("/api/admin/donations?page=" + page, { headers: headers() })
      .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function (data) {
        var items = data.items || [];
        if (!items.length) {
          tbody.innerHTML = '<tr><td colspan="7" class="muted" style="text-align:center;padding:1.5rem;">Пожертвований нет.</td></tr>';
          return;
        }
        tbody.innerHTML = items.map(function (it) {
          var name = it.is_anonymous ? "<em class='muted'>Анонимно</em>" : esc(it.name) || "—";
          return "<tr>" +
            "<td style='white-space:nowrap;'>" + formatDate(it.created_at) + "</td>" +
            "<td>" + name + "</td>" +
            "<td>" + (esc(it.email) || "—") + "</td>" +
            "<td><strong>" + formatAmount(it.amount) + "</strong></td>" +
            "<td>" + esc(it.purpose) + "</td>" +
            "<td>" + (esc(it.user_name) || "<span class='muted'>—</span>") + "</td>" +
            "<td style='max-width:200px;font-size:.83rem;color:var(--muted);'>" + (esc(it.message) || "—") + "</td>" +
            "</tr>";
        }).join("");
        renderPager("donations-pager", data.page, data.total, data.limit, loadDonations);
      })
      .catch(function () { tbody.innerHTML = '<tr><td colspan="7" class="status err" style="padding:1rem;">Ошибка загрузки.</td></tr>'; });
  }

  // ── Users ─────────────────────────────────────────────────
  function loadUsers() {
    var tbody = document.getElementById("users-tbody");
    tbody.innerHTML = '<tr><td colspan="6" class="muted" style="text-align:center;padding:1.5rem;">Загрузка…</td></tr>';
    fetch("/api/admin/users", { headers: headers() })
      .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function (data) {
        var items = data.items || [];
        if (!items.length) { tbody.innerHTML = '<tr><td colspan="6" class="muted" style="text-align:center;padding:1.5rem;">Прихожан нет.</td></tr>'; return; }
        tbody.innerHTML = items.map(function (u) {
          return "<tr>" +
            "<td style='white-space:nowrap;'>" + formatDate(u.created_at) + "</td>" +
            "<td>" + esc(u.name) + "</td>" +
            "<td>" + esc(u.email) + "</td>" +
            "<td>" + (esc(u.phone) || "—") + "</td>" +
            "<td>" + (u.news_subscribe ? "✅" : "—") + "</td>" +
            "<td><button class='btn-icon btn-danger user-del' data-id='" + u.id + "' title='Удалить'>🗑</button></td>" +
            "</tr>";
        }).join("");
        tbody.querySelectorAll(".user-del").forEach(function (btn) {
          btn.addEventListener("click", function () {
            if (!confirm("Удалить аккаунт прихожанина?")) return;
            var id = btn.getAttribute("data-id");
            fetch("/api/admin/users/" + id, { method: "DELETE", headers: headers() })
              .then(function () { loadUsers(); loadStats(); })
              .catch(function () { alert("Ошибка удаления."); });
          });
        });
      })
      .catch(function () { tbody.innerHTML = '<tr><td colspan="6" class="status err" style="padding:1rem;">Ошибка загрузки.</td></tr>'; });
  }

  // ── Local News ────────────────────────────────────────────
  function loadLocalNews() {
    var box = document.getElementById("localnews-list");
    box.innerHTML = "<p class='muted'>Загрузка…</p>";
    fetch("/api/admin/local-news", { headers: headers() })
      .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function (data) {
        var items = data.items || [];
        if (!items.length) { box.innerHTML = "<p class='muted'>Новостей пока нет.</p>"; return; }
        box.innerHTML = items.map(function (it) {
          return '<div class="news-item-row">' +
            '<div class="news-item-row__body">' +
            '<p class="news-item-row__title">' + esc(it.title) + '</p>' +
            '<p class="news-item-row__meta">' + formatDate(it.created_at) + (it.author ? " · " + esc(it.author) : "") + '</p>' +
            '<p class="news-item-row__text">' + esc(it.body).slice(0, 200) + (it.body.length > 200 ? "…" : "") + '</p>' +
            '</div>' +
            '<button class="btn-icon btn-danger news-del" data-id="' + it.id + '" title="Удалить">🗑</button>' +
            '</div>';
        }).join("");
        box.querySelectorAll(".news-del").forEach(function (btn) {
          btn.addEventListener("click", function () {
            if (!confirm("Удалить новость?")) return;
            var id = btn.getAttribute("data-id");
            fetch("/api/admin/local-news/" + id, { method: "DELETE", headers: headers() })
              .then(function () { loadLocalNews(); });
          });
        });
      })
      .catch(function () { box.innerHTML = "<p class='status err'>Ошибка загрузки.</p>"; });
  }

  // ── Pager ─────────────────────────────────────────────────
  function renderPager(containerId, page, total, limit, loadFn) {
    var box = document.getElementById(containerId);
    if (!box) return;
    var pages = Math.ceil(total / limit);
    if (pages <= 1) { box.innerHTML = ""; return; }
    var html = '<span style="font-size:.88rem;color:var(--muted);">Стр. ' + page + ' из ' + pages + '</span>';
    if (page > 1) html += ' <button class="btn btn--small" data-p="' + (page - 1) + '">‹ Назад</button>';
    if (page < pages) html += ' <button class="btn btn--small" data-p="' + (page + 1) + '">Вперёд ›</button>';
    box.innerHTML = html;
    box.querySelectorAll("[data-p]").forEach(function (btn) {
      btn.addEventListener("click", function () { loadFn(parseInt(btn.getAttribute("data-p"))); });
    });
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
        if (tab === "notes") loadNotes(1);
        if (tab === "donations") loadDonations(1);
        if (tab === "users") loadUsers();
        if (tab === "localnews") loadLocalNews();
      });
    });
  }

  function showPanel() {
    document.getElementById("admin-auth").style.display = "none";
    document.getElementById("admin-panel").style.display = "";
    document.getElementById("admin-logout").style.display = "";
    initTabs();
    loadStats();
    loadNotes(1);
  }

  function showLogin() {
    document.getElementById("admin-auth").style.display = "";
    document.getElementById("admin-panel").style.display = "none";
    document.getElementById("admin-logout").style.display = "none";
  }

  // ── Init ─────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", function () {
    // Проверяем токен
    var token = getToken();
    if (token) {
      fetch("/api/admin/stats", { headers: headers() })
        .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
        .then(function () { showPanel(); })
        .catch(function () { clearToken(); showLogin(); });
    } else {
      showLogin();
    }

    // Вход
    var formLogin = document.getElementById("form-admin-login");
    if (formLogin) {
      formLogin.addEventListener("submit", async function (ev) {
        ev.preventDefault();
        setStatus("admin-login-status", "Входим…", null);
        var fd = new FormData(formLogin);
        try {
          var r = await fetch("/api/auth/admin-login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ login: fd.get("login"), password: fd.get("password") }),
          });
          var d = await r.json();
          if (!r.ok) throw new Error(d.error || "Ошибка");
          saveToken(d.token);
          showPanel();
        } catch (e) {
          setStatus("admin-login-status", e.message, false);
        }
      });
    }

    // Выход
    var logoutBtn = document.getElementById("admin-logout");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", function () {
        clearToken(); showLogin();
      });
    }

    // Фильтр записок
    var notesFilter = document.getElementById("notes-filter");
    if (notesFilter) notesFilter.addEventListener("change", function () { loadNotes(1); });
    var notesRefresh = document.getElementById("notes-refresh");
    if (notesRefresh) notesRefresh.addEventListener("click", function () { loadNotes(1); loadStats(); });

    // Добавление новости
    var formNews = document.getElementById("form-local-news");
    if (formNews) {
      formNews.addEventListener("submit", async function (ev) {
        ev.preventDefault();
        setStatus("localnews-status", "Публикация…", null);
        var fd = new FormData(formNews);
        try {
          var r = await fetch("/api/admin/local-news", {
            method: "POST", headers: headers(),
            body: JSON.stringify({ title: fd.get("title"), body: fd.get("body"), author: fd.get("author") }),
          });
          var d = await r.json();
          if (!r.ok) throw new Error(d.error || "Ошибка");
          setStatus("localnews-status", "Опубликовано!", true);
          formNews.reset();
          loadLocalNews();
        } catch (e) {
          setStatus("localnews-status", e.message, false);
        }
      });
    }
  });
})();