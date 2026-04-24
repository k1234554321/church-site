(function () {
  function loadNews() {
    var box = document.getElementById("news-feed");
    var src = document.getElementById("news-source");
    if (!box) return;
    box.innerHTML = '<p class="muted">Загрузка…</p>';
    var q = src && src.value ? "?source=" + encodeURIComponent(src.value) + "&limit=30" : "?limit=30";
    fetch("/api/news" + q)
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        var items = data.items || [];
        if (!items.length) {
          box.innerHTML = '<p class="muted">Новостей нет или лента временно недоступна.</p>';
          return;
        }
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
          meta.textContent = (it.sourceTitle || "") + (it.date ? " · " + it.date : "");
          art.appendChild(meta);
          if (it.excerpt) {
            var p = document.createElement("p");
            p.className = "muted";
            p.textContent = it.excerpt;
            art.appendChild(p);
          }
          box.appendChild(art);
        });
      })
      .catch(function () {
        box.innerHTML =
          '<p class="status err">Не удалось загрузить ленту. Запустите сервер (<code>npm start</code>) и проверьте интернет.</p>';
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var refresh = document.getElementById("news-refresh");
    var sourceSel = document.getElementById("news-source");
    if (refresh) refresh.addEventListener("click", loadNews);
    if (sourceSel) sourceSel.addEventListener("change", loadNews);
    loadNews();
  });
})();
