(() => {
  const themeNames = {
    ledger: "墨绿账房",
    midnight: "夜航蓝",
    wine: "酒红沙龙",
    paper: "奶油票据",
  };
  const phones = [...document.querySelectorAll(".phone")];
  const themeButtons = [...document.querySelectorAll("[data-set-theme]")];
  const currentThemeEl = document.querySelector("#currentTheme");

  const applyTheme = (name, persist = true) => {
    const safeName = themeNames[name] ? name : "ledger";
    phones.forEach((phone) => {
      phone.dataset.theme = safeName;
    });
    themeButtons.forEach((button) => {
      const active = button.dataset.setTheme === safeName;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    if (currentThemeEl) currentThemeEl.textContent = themeNames[safeName];
    if (persist) {
      try {
        localStorage.setItem("monopay-theme", safeName);
      } catch {
        // Local file previews can block storage; still switch for this session.
      }
    }
  };

  themeButtons.forEach((button) => {
    button.addEventListener("click", () => applyTheme(button.dataset.setTheme));
  });

  let savedTheme = "ledger";
  try {
    savedTheme = localStorage.getItem("monopay-theme") || "ledger";
  } catch {
    savedTheme = "ledger";
  }
  applyTheme(savedTheme, false);

  const amountEl = document.querySelector("#payAmount");
  const confirmEl = document.querySelector("#payConfirm");
  const hintEl = document.querySelector("#payHint");
  const keypad = document.querySelector("#keypad");
  const quickRow = document.querySelector("#quickAmounts");
  const recipients = document.querySelector("#recipients");
  const categories = document.querySelector("#categories");

  if (!amountEl || !confirmEl || !hintEl || !keypad) return;

  const balance = 2450;
  const fmt = new Intl.NumberFormat("zh-CN");
  let amount = 200;
  let recipient = "小美";
  let replaceOnNext = true;

  const syncPressed = (container) => {
    container.querySelectorAll("button").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.classList.contains("is-selected")));
    });
  };

  const setSelected = (container, target) => {
    container.querySelectorAll(".is-selected").forEach((el) => el.classList.remove("is-selected"));
    target.classList.add("is-selected");
    syncPressed(container);
  };

  const render = () => {
    const safeAmount = Math.max(0, Math.min(amount, 99999));
    amount = safeAmount;
    amountEl.textContent = fmt.format(safeAmount);
    confirmEl.textContent = `确认支付 ${fmt.format(safeAmount)} M`;

    const after = balance - safeAmount;
    const insufficient = safeAmount > balance;
    confirmEl.disabled = insufficient || safeAmount === 0;
    confirmEl.classList.toggle("is-disabled", confirmEl.disabled);
    hintEl.classList.toggle("is-error", insufficient || safeAmount === 0);
    hintEl.textContent =
      safeAmount === 0
        ? "请输入金额"
        : insufficient
          ? `余额不足，还差 ${fmt.format(safeAmount - balance)} M · 先收款/抵押`
          : `支付后余额 ${fmt.format(after)} M · 即时到账 · 付给${recipient}`;

    quickRow.querySelectorAll("button").forEach((button) => {
      button.classList.toggle("is-selected", Number(button.dataset.amount) === safeAmount);
    });
  };

  keypad.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-key]");
    if (!button) return;
    const key = button.dataset.key;

    if (key === "back") {
      amount = Math.floor(amount / 10);
    } else if (replaceOnNext) {
      amount = Number(key);
    } else {
      amount = Number(`${amount}${key}`);
    }

    replaceOnNext = false;
    render();
  });

  quickRow.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-amount]");
    if (!button) return;
    amount = Number(button.dataset.amount);
    replaceOnNext = true;
    render();
  });

  recipients.addEventListener("click", (event) => {
    const button = event.target.closest(".recipient");
    if (!button) return;
    recipient = button.dataset.name;
    setSelected(recipients, button);
    render();
  });

  if (categories) {
    categories.addEventListener("click", (event) => {
      const button = event.target.closest(".chip");
      if (!button) return;
      setSelected(categories, button);
    });
  }

  confirmEl.addEventListener("click", () => {
    if (confirmEl.disabled) return;
    confirmEl.textContent = `已付 ${fmt.format(amount)} M 给${recipient}`;
    window.setTimeout(render, 1100);
  });

  document.querySelectorAll(".tabbar").forEach((tabbar) => {
    tabbar.addEventListener("click", (event) => {
      const tab = event.target.closest(".tab");
      if (!tab) return;
      tabbar.querySelectorAll(".tab").forEach((item) => item.classList.remove("is-active"));
      tab.classList.add("is-active");
    });
  });

  syncPressed(recipients);
  if (categories) syncPressed(categories);
  render();
})();
