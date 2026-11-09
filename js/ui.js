/* ==========================================================
   共用交互：光标插入、焦点跟踪、退格、清空、复制结果
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

  input.focus();
  setCaret(input, pos);
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
  input.focus();
  setCaret(input, start);
}

function clearFields(ids) {
  for (var i = 0; i < ids.length; i++) {
    var el = document.getElementById(ids[i]);
    if (el) el.value = "";
  }
  var first = document.getElementById(ids[0]);
  if (first) first.focus();
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

/* 记录当前输入框；支持在输入框内按回车直接计算 */
document.addEventListener("DOMContentLoaded", function () {
  var inputs = document.querySelectorAll("input[type=text], input[type=number], textarea");

  for (var i = 0; i < inputs.length; i++) {
    (function (input) {
      input.addEventListener("focus", function () { ElementId = input.id; });

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
});
