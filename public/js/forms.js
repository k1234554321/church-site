(function () {
  function setStatus(el, text, ok) {
    if (!el) return;
    el.textContent = text;
    el.classList.remove("ok", "err");
    if (ok === true) el.classList.add("ok");
    if (ok === false) el.classList.add("err");
  }

  document.addEventListener("DOMContentLoaded", function () {
    var fd = document.getElementById("form-donate");
    if (fd) {
      function updatePaymentBlocks() {
        var checked = fd.querySelector('input[name="paymentMethod"]:checked');
        var method = checked ? checked.value : "card";

        var cardBlock = document.getElementById("payment-card");
        var sbpBlock = document.getElementById("payment-sbp");
        if (cardBlock) cardBlock.style.display = method === "card" ? "" : "none";
        if (sbpBlock) sbpBlock.style.display = method === "sbp" ? "" : "none";

        fd.querySelectorAll(".donate-method").forEach(function (lab) {
          var labelMethod = lab.getAttribute("data-method-label");
          if (labelMethod === method) lab.classList.add("is-active");
          else lab.classList.remove("is-active");
        });

        var cardLast4 = fd.querySelector('input[name="cardLast4"]');
        var sbpPhone = fd.querySelector('input[name="sbpPhone"]');
        if (cardLast4) cardLast4.required = method === "card";
        if (sbpPhone) sbpPhone.required = method === "sbp";
      }

      fd.querySelectorAll('input[name="paymentMethod"]').forEach(function (r) {
        r.addEventListener("change", updatePaymentBlocks);
      });
      updatePaymentBlocks();

      fd.addEventListener("submit", async function (ev) {
        ev.preventDefault();
        var st = document.getElementById("donate-status");
        setStatus(st, "Отправка…", null);
        var form = new FormData(fd);

        var checked = fd.querySelector('input[name="paymentMethod"]:checked');
        var method = checked ? checked.value : "";
        var paymentNote = "";

        if (method === "card") {
          var last4 = String(form.get("cardLast4") || "").replace(/\D/g, "");
          if (last4.length !== 4) throw new Error("Укажите последние 4 цифры карты.");
          var holder = String(form.get("cardHolder") || "").trim();
          paymentNote =
            "Оплата картой. Последние 4 цифры: " +
            last4 +
            (holder ? ". Имя плательщика: " + holder : "") +
            ".";
        } else if (method === "sbp") {
          var phoneRaw = String(form.get("sbpPhone") || "").trim();
          var digits = phoneRaw.replace(/\D/g, "");
          if (digits.length < 10) throw new Error("Укажите телефон для СБП.");
          var sbpHolder = String(form.get("sbpHolder") || "").trim();
          paymentNote =
            "Оплата по СБП. Телефон: " +
            phoneRaw +
            (sbpHolder ? ". Имя плательщика: " + sbpHolder : "") +
            ".";
        } else {
          throw new Error("Выберите способ оплаты: карта или СБП.");
        }

        var msg = String(form.get("message") || "").trim();
        var messageFinal = msg ? msg + "\n\n" + paymentNote : paymentNote;

        var body = {
          amount: form.get("amount"),
          purpose: form.get("purpose"),
          name: form.get("name"),
          email: form.get("email"),
          message: messageFinal,
          isAnonymous: form.get("isAnonymous") === "on",
        };
        try {
          var res = await fetch("/api/donations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          var data = await res.json().catch(function () {
            return {};
          });
          if (!res.ok) throw new Error(data.error || "Ошибка");
          setStatus(st, "Спасибо за пожертвование, да хранит вас господь!", true);
          fd.reset();
          updatePaymentBlocks();
        } catch (e) {
          setStatus(st, e.message || "Ошибка отправки", false);
        }
      });
    }

    var fn = document.getElementById("form-notes");
    if (fn) {
      fn.addEventListener("submit", async function (ev) {
        ev.preventDefault();
        var st = document.getElementById("notes-status");
        setStatus(st, "Отправка…", null);
        var form = new FormData(fn);
        var body = {
          names: form.get("names"),
          noteType: form.get("noteType"),
          temple: form.get("temple"),
          servedFor: form.get("servedFor"),
          contact: form.get("contact"),
        };
        try {
          var res = await fetch("/api/notes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          var data = await res.json().catch(function () {
            return {};
          });
          if (!res.ok) throw new Error(data.error || "Ошибка");
          setStatus(st, "Записка сохранена. № " + data.id, true);
          fn.reset();
        } catch (e) {
          setStatus(st, e.message || "Ошибка отправки", false);
        }
      });
    }
  });
})();
