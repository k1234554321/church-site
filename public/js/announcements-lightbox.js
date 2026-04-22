(function () {
  document.addEventListener("DOMContentLoaded", function () {
    var openBtn = document.getElementById("announce-board-open");
    var box = document.getElementById("photo-lightbox");
    var img = document.getElementById("photo-lightbox-img");
    var closeBtn = box && box.querySelector(".photo-lightbox__close");
    var inner = box && box.querySelector(".photo-lightbox__inner");

    if (!openBtn || !box || !img) return;

    var fullSrc = openBtn.getAttribute("data-full-src") || openBtn.querySelector("img").getAttribute("src");

    function openLb() {
      img.src = fullSrc;
      img.alt = openBtn.querySelector("img").getAttribute("alt") || "";
      box.classList.add("is-open");
      document.body.style.overflow = "hidden";
      if (closeBtn) closeBtn.focus();
    }

    function closeLb() {
      box.classList.remove("is-open");
      document.body.style.overflow = "";
      img.removeAttribute("src");
      openBtn.focus();
    }

    openBtn.addEventListener("click", function () {
      openLb();
    });

    if (closeBtn) closeBtn.addEventListener("click", closeLb);

    box.addEventListener("click", function (e) {
      if (e.target === box) closeLb();
    });

    if (inner) {
      inner.addEventListener("click", function (e) {
        e.stopPropagation();
      });
    }

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && box.classList.contains("is-open")) closeLb();
    });
  });
})();
