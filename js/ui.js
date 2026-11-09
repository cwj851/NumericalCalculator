/* ==========================================================
   共用交互：光标插入、焦点跟踪、退格、清空、复制结果
   手机端额外提供“输入回显条”，键盘在页面下方时也能看到输入内容
   ========================================================== */

var ElementId = "equation";

function getInputElement() {
  return document.getElementById(ElementId) || document.getElementById("equation");
}

/* 在光标处插入符号；插入 sin() 这类模板时，光标停在括号内 */
function insertSymbol(symbol) {
  var input = getInputElement();
  if (!input) return;

  var start = input.selectionStart;
  var end = input.selectionEnd;
  var value = input.value;

  if (typeof start !== "number") { start = end = value.length; }

  input.value = value.substring(0, start) + symbol + value.substring(end);

  var pos = start + symbol.length;
  if (/\(\)$/.test(symbol)) pos -= 1;

  focusInput(input);
  setCaret(input, pos);
  ElementId = input.id;
  echoEditing = input.id;
  syncEcho();
}

function setCaret(input, pos) {
  try {
    input.setSelectionRange(pos, pos);
  } catch (e) {
    /* number 类型的输入框不支持选区，忽略 */
  }
}

function getFocusedElement() {
  var el = document.activeElement;
  if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA") && el.id) {
    ElementId = el.id;
  }
}

/* 退格：有选区删选区，无选区删光标前一个字符 */
function backspace() {
  var input = getInputElement();
  if (!input) return;

  var start = input.selectionStart;
  var end = input.selectionEnd;
  if (typeof start !== "number") { start = end = input.value.length; }
  if (start === end && start > 0) start -= 1;

  input.value = input.value.substring(0, start) + input.value.substring(end);
  focusInput(input);
  setCaret(input, start);
  ElementId = input.id;
  echoEditing = input.id;
  syncEcho();
}

function clearFields(ids) {
  for (var i = 0; i < ids.length; i++) {
    var el = document.getElementById(ids[i]);
    if (el) el.value = "";
  }
  var first = document.getElementById(ids[0]);
  if (first) {
    ElementId = ids[0];
    focusInput(first);
  }
  echoEditing = ids[0];
  syncEcho();
}

/* 复制结果：去掉 <br> 转成换行，并用反引号包裹，便于粘贴到 Markdown */
function copyResult(targetId) {
  var target = document.getElementById(targetId);
  if (!target) return;

  var text = target.innerHTML.replace(/<br\s*\/?>/gi, "\n").trim();
  if (!text) { showToast("还没有可复制的结果"); return; }

  var area = document.createElement("textarea");
  area.value = "`" + text + "`";
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.top = "-1000px";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();

  var ok = false;
  try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
  document.body.removeChild(area);

  showToast(ok ? "已复制到剪贴板" : "复制失败，请手动选择文本");
}

function showToast(message) {
  var tip = document.getElementById("toast");
  if (!tip) return;
  tip.textContent = message;
  tip.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(function () { tip.classList.remove("show"); }, 1500);
}

/* ==========================================================
   手机端输入回显条
   - 回显条插在右侧/下方“输入面板”卡片的顶部，并吸顶显示
   - 显示当前输入框的名称、完整内容（可在光标处闪烁），超长时横向滚动
   - 点击回显条可跳回对应输入框
   ========================================================== */

var echo = null;          // { bar, label, value }
var echoEditing = null;   // 最近一次用屏幕键盘编辑的输入框 id（失焦后仍要显示光标）

/* 屏幕键盘按键后的聚焦处理：
   手机端不抢焦点——input.focus() 会让浏览器把页面原生滚动到该输入框，
   还会弹出系统键盘盖住数字键盘，于是每按一个键就得重新滑回键盘处。
   值照常写入、光标位置照常留在输入框上，回显条会自己画光标。
   桌面端（双列并排、基本不滚动）保持聚焦，方便接着用物理键盘输入。 */
function focusInput(input) {
  if (!input) return;
  if (window.innerWidth < 860) return;
  try {
    input.focus({ preventScroll: true });
  } catch (e) {
    input.focus();
  }
}

/* 取当前要回显的输入框：优先 ElementId，隐藏了（如按算法切换）就退回函数输入框 */
function getEchoInput() {
  var input = document.getElementById(ElementId);
  if (input && input.offsetParent === null) input = null;

  if (!input) {
    input = document.getElementById("equation");
    if (input && input.offsetParent === null) input = null;
  }

  if (!input) {
    var all = document.querySelectorAll("input[type=text], input[type=number], textarea");
    for (var i = 0; i < all.length; i++) {
      if (all[i].offsetParent !== null) { input = all[i]; break; }
    }
  }
  return input || null;
}

/* 输入框对应的字段名，直接取 label.field 里的文字，避免每页维护映射表 */
function getFieldLabel(input) {
  var text = "";
  var holder = input.closest ? input.closest("label.field") : null;
  if (holder) {
    var span = holder.querySelector("span");
    if (span) text = span.textContent.trim();
  }
  if (!text) text = input.getAttribute("placeholder") || "输入内容";

  // 回显条空间有限，“方程（未知数用 x 表示）”这类括号说明只保留主干
  var cut = text.indexOf("（");
  if (cut > 0) text = text.substring(0, cut);
  return text;
}

var echoTabsSignature = "";

/* 页面上可编辑的输入框（按文档顺序，跳过隐藏的，例如数值积分切算法后隐藏的 n / tol） */
function listEditableInputs() {
  var all = document.querySelectorAll("input[type=text], input[type=number], textarea");
  var list = [];
  for (var i = 0; i < all.length; i++) {
    if (all[i].offsetParent !== null) list.push(all[i]);
  }
  return list;
}

/* 切换当前编辑的字段：只换目标，不滚动页面、不弹系统键盘 */
function selectField(input) {
  if (!input) return;

  ElementId = input.id;
  echoEditing = input.id;
  setCaret(input, (input.value || "").length);

  if (window.innerWidth >= 860) {
    try { input.focus({ preventScroll: true }); } catch (e) { }
  }
  syncEcho();
}

/* 字段标签：字段多于一个时在键盘上方直接切换，避免上下滑动去找输入框 */
function syncFieldTabs(current) {
  if (!echo) return;

  var inputs = listEditableInputs();
  var ids = [];
  var i;
  for (i = 0; i < inputs.length; i++) ids.push(inputs[i].id);

  var signature = ids.join("|");
  if (signature !== echoTabsSignature) {
    echoTabsSignature = signature;
    echo.tabs.textContent = "";

    for (i = 0; i < inputs.length; i++) {
      (function (input) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "field-tab";
        btn.setAttribute("data-field", input.id);
        btn.textContent = getFieldLabel(input);
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          selectField(input);
        });
        echo.tabs.appendChild(btn);
      })(inputs[i]);
    }

    // 只有一个字段时不显示标签行，省高度
    echo.tabs.style.display = inputs.length > 1 ? "flex" : "none";
    if (inputs.length > 1) echo.bar.classList.add("has-tabs");
    else echo.bar.classList.remove("has-tabs");
  }

  var tabs = echo.tabs.querySelectorAll(".field-tab");
  for (i = 0; i < tabs.length; i++) {
    var active = !!current && tabs[i].getAttribute("data-field") === current.id;
    tabs[i].className = active ? "field-tab active" : "field-tab";
  }
}

function initEchoBar() {
  if (echo) return;

  var side = document.querySelector(".side");
  if (!side) return;

  var bar = document.createElement("div");
  bar.className = "echo-bar";
  bar.setAttribute("role", "status");

  var tabs = document.createElement("div");
  tabs.className = "field-tabs";

  var row = document.createElement("div");
  row.className = "echo-row";

  var label = document.createElement("span");
  label.className = "echo-label";

  var value = document.createElement("span");
  value.className = "echo-value";

  row.appendChild(label);
  row.appendChild(value);
  bar.appendChild(tabs);
  bar.appendChild(row);
  side.insertBefore(bar, side.firstChild);

  echo = { bar: bar, tabs: tabs, label: label, value: value };
}

function syncEcho() {
  if (!echo) return;

  var input = getEchoInput();
  if (!input) { echo.bar.style.display = "none"; return; }
  echo.bar.style.display = "";

  syncFieldTabs(input);

  var labelText = getFieldLabel(input);
  if (echo.label.textContent !== labelText) echo.label.textContent = labelText;

  var text = input.value || "";
  var caret = text.length;
  if (typeof input.selectionStart === "number" && input.selectionStart !== null) {
    caret = Math.min(input.selectionStart, text.length);
  }
  // 手机端按屏幕键盘时输入框可能已经失焦，这时仍按“正在编辑”画光标
  var showCaret = document.activeElement === input || echoEditing === input.id;

  echo.value.textContent = "";
  echo.value.classList.remove("is-empty");

  if (text === "") {
    echo.value.classList.add("is-empty");
    echo.value.appendChild(document.createTextNode("尚未输入"));
  } else {
    echo.value.appendChild(document.createTextNode(text.substring(0, caret)));
  }

  var caretEl = null;
  if (showCaret) {
    caretEl = document.createElement("i");
    caretEl.className = "echo-caret";
    echo.value.appendChild(caretEl);
  }

  if (text !== "") echo.value.appendChild(document.createTextNode(text.substring(caret)));

  // 光标靠右时把滚动条推到底，避免输入越长越看不见
  if (caretEl) {
    echo.value.scrollLeft = Math.max(0, caretEl.offsetLeft - echo.value.clientWidth + 28);
  } else {
    echo.value.scrollLeft = 0;
  }
}

/* 回显条吸顶位置 = 顶栏高度（顶栏本身也是 sticky） */
function updateEchoOffset() {
  var topbar = document.querySelector(".topbar");
  var height = topbar ? Math.round(topbar.getBoundingClientRect().height) : 0;
  document.documentElement.style.setProperty("--echo-top", height + "px");
}

/* 输入框是否完整落在视口内（顶栏下方、软键盘上方之外） */
function isFieldInView(input) {
  var rect = input.getBoundingClientRect();
  var top = 0;
  var topbar = document.querySelector(".topbar");
  if (topbar) top = topbar.getBoundingClientRect().bottom;
  return rect.top >= top && rect.bottom <= window.innerHeight;
}

/* 用户主动点输入框、且被顶栏挡住时才滚动（屏幕键盘由浏览器自己处理） */
function scrollFieldIntoViewIfNeeded(input) {
  if (window.innerWidth >= 860) return;
  if (isFieldInView(input)) return;

  setTimeout(function () {
    input.scrollIntoView({ block: "center", behavior: "smooth" });
  }, 160);
}

/* 记录当前输入框；绑定回显；支持在输入框内按回车直接计算 */
document.addEventListener("DOMContentLoaded", function () {
  var inputs = document.querySelectorAll("input[type=text], input[type=number], textarea");

  initEchoBar();
  updateEchoOffset();

  for (var i = 0; i < inputs.length; i++) {
    (function (input) {
      input.addEventListener("focus", function () {
        ElementId = input.id;
        syncEcho();
        scrollFieldIntoViewIfNeeded(input);
      });

      input.addEventListener("input", syncEcho);
      input.addEventListener("keyup", syncEcho);
      input.addEventListener("click", syncEcho);
      input.addEventListener("select", syncEcho);

      var handler = input.getAttribute("data-enter");
      if (!handler) return;

      input.addEventListener("keydown", function (e) {
        if (e.key !== "Enter") return;
        e.preventDefault();
        var fn = window[handler];
        if (typeof fn === "function") fn();
      });
    })(inputs[i]);
  }

  syncEcho();
});

window.addEventListener("resize", function () {
  updateEchoOffset();
  syncEcho();
});

window.addEventListener("orientationchange", function () {
  setTimeout(function () {
    updateEchoOffset();
    syncEcho();
  }, 200);
});
