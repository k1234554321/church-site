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
