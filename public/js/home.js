(function () {
  function setHomeStatus(text, isError) {
    var box = document.getElementById("home-news-feed");
    if (!box) return;
    box.innerHTML =
      '<p class="' + (isError ? "status err" : "muted") + '">' + text + "</p>";
  }

  function renderItems(items) {
    var box = document.getElementById("home-news-feed");
    if (!box) return;
    box.innerHTML = "";

    items.forEach(function (it) {
      var art = document.createElement("article");
      art.className = "news-item";

      var h = document.createElement("h2");
      h.className = "news-item__title";

      var link = document.createElement("a");
      link.href = it.link || "#";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = it.title || "Без заголовка";
      h.appendChild(link);

      art.appendChild(h);

      var meta = document.createElement("p");
      meta.className = "news-meta";
      meta.textContent =
        (it.sourceTitle || "") + (it.date ? " · " + it.date : "");
      art.appendChild(meta);

      if (it.excerpt) {
        var p = document.createElement("p");
        p.className = "muted";
        p.textContent = it.excerpt;
        art.appendChild(p);
      }

      box.appendChild(art);
    });
  }

  async function loadHomeNews() {
    var box = document.getElementById("home-news-feed");
    if (!box) return;
    box.innerHTML = '<p class="muted">Загрузка…</p>';

    var src = document.getElementById("home-news-source");
    var limit = 3;
    var sourceVal = src && src.value ? src.value : "all";
    var q =
      sourceVal === "all"
        ? "?limit=" + limit
        : "?source=" + encodeURIComponent(sourceVal) + "&limit=" + limit;

    try {
      var res = await fetch("/api/news" + q);
      if (!res.ok) throw new Error("HTTP " + res.status);
      var data = await res.json();
      var items = data.items || [];

      if (!items.length) {
        setHomeStatus("Новостей пока нет или лента недоступна.", false);
        return;
      }
      renderItems(items);
    } catch (e) {
      setHomeStatus(
        "Не удалось загрузить новости. Проверь интернет и запусти сервер.",
        true
      );
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    var refresh = document.getElementById("home-news-refresh");
    var sourceSel = document.getElementById("home-news-source");
    if (refresh) refresh.addEventListener("click", loadHomeNews);
    if (sourceSel) sourceSel.addEventListener("change", loadHomeNews);
    loadHomeNews();
  });
})();

