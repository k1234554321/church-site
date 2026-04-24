(function () {
  function setYear() {
    var y = document.getElementById("year");
    if (y) y.textContent = String(new Date().getFullYear());
  }

  function wireNav() {
    var nav = document.getElementById("site-nav");
    var toggle = document.querySelector(".nav-toggle");
    if (!toggle || !nav) return;
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    nav.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  function markActive(active) {
    document.querySelectorAll(".site-nav a[data-nav]").forEach(function (a) {
      if (a.getAttribute("data-nav") === active) {
        a.classList.add("is-active");
        a.setAttribute("aria-current", "page");
      } else {
        a.classList.remove("is-active");
        a.removeAttribute("aria-current");
      }
    });
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function initFaithBot() {
    if (document.getElementById("faith-bot")) return;
    var root = document.createElement("section");
    root.id = "faith-bot";
    root.className = "faith-bot";
    root.innerHTML =
      '<button type="button" class="faith-bot__toggle" id="faith-bot-toggle" aria-expanded="false" aria-controls="faith-bot-panel">✝ Вопрос священнику-боту</button>' +
      '<div class="faith-bot__panel" id="faith-bot-panel" aria-hidden="true">' +
      '<div class="faith-bot__head"><strong>Помощник прихода</strong><button type="button" class="faith-bot__close" id="faith-bot-close" aria-label="Закрыть">×</button></div>' +
      '<div class="faith-bot__messages" id="faith-bot-messages"></div>' +
      '<form class="faith-bot__form" id="faith-bot-form">' +
      '<textarea class="faith-bot__input" id="faith-bot-input" placeholder="Например: зачем нужен пост?" required></textarea>' +
      '<button class="btn btn--primary" type="submit">Отправить</button>' +
      "</form>" +
      "</div>";
    document.body.appendChild(root);

    var panel = document.getElementById("faith-bot-panel");
    var toggle = document.getElementById("faith-bot-toggle");
    var close = document.getElementById("faith-bot-close");
    var form = document.getElementById("faith-bot-form");
    var input = document.getElementById("faith-bot-input");
    var messages = document.getElementById("faith-bot-messages");
    var history = [];

    function addMessage(role, text) {
      var p = document.createElement("p");
      p.className = "faith-bot__msg faith-bot__msg--" + role;
      p.innerHTML = escapeHtml(text).replace(/\n/g, "<br>");
      messages.appendChild(p);
      messages.scrollTop = messages.scrollHeight;
    }

    function remember(role, text) {
      history.push({ role: role, content: String(text || "") });
      if (history.length > 20) history = history.slice(-20);
    }

    function openPanel() {
      panel.classList.add("is-open");
      panel.setAttribute("aria-hidden", "false");
      toggle.setAttribute("aria-expanded", "true");
      input.focus();
    }

    function closePanel() {
      panel.classList.remove("is-open");
      panel.setAttribute("aria-hidden", "true");
      toggle.setAttribute("aria-expanded", "false");
    }

    toggle.addEventListener("click", function () {
      if (panel.classList.contains("is-open")) closePanel();
      else openPanel();
    });
    close.addEventListener("click", closePanel);

    addMessage(
      "bot",
      "Здравствуйте. Я отвечаю на вопросы о христианстве, молитве и Библии. Чем могу помочь?"
    );
    remember("assistant", "Здравствуйте. Я отвечаю на вопросы о христианстве, молитве и Библии. Чем могу помочь?");

    form.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      var q = String(input.value || "").trim();
      if (!q) return;
      addMessage("user", q);
      remember("user", q);
      input.value = "";
      addMessage("bot", "Думаю над ответом…");
      var loading = messages.lastElementChild;
      try {
        var r = await fetch("/api/chatbot/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: q, history: history }),
        });
        var d = await r.json();
        if (loading) loading.remove();
        if (!r.ok) throw new Error(d.error || "Ошибка");
        var refs = d.references && d.references.length ? "\n\nСсылки: " + d.references.join(", ") : "";
        var botText = (d.answer || "Не удалось сформировать ответ.") + refs;
        addMessage("bot", botText);
        remember("assistant", botText);
      } catch (e) {
        if (loading) loading.remove();
        addMessage("bot", "Не удалось получить ответ. Попробуйте еще раз.");
        remember("assistant", "Не удалось получить ответ. Попробуйте еще раз.");
      }
    });

    setTimeout(function () {
      if (sessionStorage.getItem("faith_bot_greeted")) return;
      sessionStorage.setItem("faith_bot_greeted", "1");
      openPanel();
      addMessage("bot", "Рада помочь. Можете спросить, например: «Что значит покаяние?»");
      remember("assistant", "Рада помочь. Можете спросить, например: «Что значит покаяние?»");
    }, 5000);
  }

  function initVisualEffects() {
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    // Parallax for hero/page heads and large media cards.
    var parallaxNodes = Array.prototype.slice.call(
      document.querySelectorAll(".hero, .page-head, .content-photo img, .map-embed")
    );
    parallaxNodes.forEach(function (el, idx) {
      if (!el.dataset.parallaxSpeed) {
        var speed = el.classList.contains("hero") ? 0.18 : 0.1 + (idx % 3) * 0.04;
        el.dataset.parallaxSpeed = String(speed);
      }
      el.classList.add("parallax-item");
    });

    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        var y = window.scrollY || window.pageYOffset || 0;
        parallaxNodes.forEach(function (el) {
          var speed = Number(el.dataset.parallaxSpeed || "0.12");
          var offset = Math.max(-36, Math.min(36, y * speed * 0.25));
          el.style.setProperty("--parallax-offset", offset.toFixed(2) + "px");
        });
        ticking = false;
      });
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    // Soft 3D tilt for cards on desktop.
    if (window.matchMedia && window.matchMedia("(min-width: 901px)").matches) {
      var tiltNodes = document.querySelectorAll(".card, .news-item, .schedule-card, .clergy-card");
      tiltNodes.forEach(function (el) {
        el.classList.add("tilt-card");
        el.addEventListener("mousemove", function (ev) {
          var r = el.getBoundingClientRect();
          var px = (ev.clientX - r.left) / r.width;
          var py = (ev.clientY - r.top) / r.height;
          var rx = (0.5 - py) * 4;
          var ry = (px - 0.5) * 6;
          el.style.setProperty("--tilt-x", rx.toFixed(2) + "deg");
          el.style.setProperty("--tilt-y", ry.toFixed(2) + "deg");
        });
        el.addEventListener("mouseleave", function () {
          el.style.setProperty("--tilt-x", "0deg");
          el.style.setProperty("--tilt-y", "0deg");
        });
      });
    }
  }

  document.addEventListener("DOMContentLoaded", async function () {
    var active = document.body.getAttribute("data-nav") || "home";
    var hr = document.getElementById("header-root");
    var fr = document.getElementById("footer-root");
    try {
      // Если шапка/подвал уже отданы с сервера (например news.php), не перезаписывать.
      var headerAlready = hr && hr.querySelector(".site-header");
      var footerAlready = fr && fr.querySelector(".site-footer");
      if (hr && !headerAlready) {
        var rh = await fetch("/partials/header.html");
        hr.innerHTML = await rh.text();
      }
      if (fr && !footerAlready) {
        var rf = await fetch("/partials/footer.html");
        fr.innerHTML = await rf.text();
      }
    } catch (e) {
      console.error(e);
    }
    markActive(active);
    wireNav();
    setYear();
    initFaithBot();
    initVisualEffects();

    // Универсальные анимации для современного UI (без правки каждой страницы).
    // Мы добавляем классы и запускаем reveal при попадании в область видимости.
    try {
      var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!reduce) {
        var selectors = [
          ".section",
          ".page-head",
          ".content-photo",
          ".reveal",
          ".news-item",
          ".schedule-card",
          ".announce-list li",
          ".card",
          ".clergy-card",
          ".map-embed",
          ".form",
          ".link-card",
          ".hero__inner",
        ].join(",");

        var targets = Array.prototype.slice.call(document.querySelectorAll(selectors));

        var io = new IntersectionObserver(
          function (entries) {
            entries.forEach(function (e) {
              if (e.isIntersecting) e.target.classList.add("is-visible");
            });
          },
          { threshold: 0.15 }
        );

        targets.forEach(function (el) {
          el.classList.add("anim-fade");
          io.observe(el);
        });
      }
    } catch (e) {
      // Если IntersectionObserver не поддерживается — просто без анимаций.
    }
  });
})();
