/* ==========================================================
   常数值表达式解析（供插值与拟合、线性方程组等页面共用）
   支持 + − × ÷ ^、括号、sqrt/ln/log/三角、常量 pi / e，
   以及 √2、π/2、2pi、3(1+2) 这类写法
   ========================================================== */

var EXPR_FUNCS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  ln: Math.log, log: Math.log10, log10: Math.log10, log2: Math.log2,
  exp: Math.exp, sqrt: Math.sqrt, abs: Math.abs, cbrt: Math.cbrt
};

function exprStripSpaces(text) {
  var out = "";
  for (var i = 0; i < text.length; i++) {
    var ch = text.substring(i, i + 1);
    if (ch !== " ") out += ch;
  }
  return out;
}

/* 统一各种写法：全角逗号、×÷−、π、√、²³ 等 */
function normalizeExpr(text) {
  var s = exprStripSpaces(String(text));
  return s.replace(/，/g, ",")
    .replace(/[×·]/g, "*")
    .replace(/÷/g, "/")
    .replace(/[−–—]/g, "-")
    .replace(/π/g, "pi")
    .replace(/√/g, "sqrt")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3");
}

function tokenizeExpr(src) {
  var tokens = [], i = 0;

  while (i < src.length) {
    var rest = src.substring(i);
    var ch = src.charAt(i);

    if (ch === " ") { i++; continue; }

    var numMatch = /^(\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest);
    if (numMatch) {
      var numValue = Number(numMatch[0]);
      if (!isFinite(numValue)) throw new Error("数字写法不对：" + numMatch[0]);
      tokens.push({ type: "num", value: numValue, text: numMatch[0] });
      i += numMatch[0].length;
      continue;
    }

    var nameMatch = /^[a-zA-Z]+/.exec(rest);
    if (nameMatch) {
      var name = nameMatch[0].toLowerCase();
      var nameLen = nameMatch[0].length;

      // log10 / log2 这类带数字的函数名单独认出来，其它情况数字算隐式乘号（√2 → sqrt*2）
      var tail = /^\d+/.exec(rest.substring(nameLen));
      if (tail && EXPR_FUNCS[name + tail[0]]) {
        name += tail[0];
        nameLen += tail[0].length;
      }

      tokens.push({ type: "name", text: name });
      i += nameLen;
      continue;
    }

    if ("+-*/^(),".indexOf(ch) >= 0) {
      tokens.push({ type: ch });
      i++;
      continue;
    }

    throw new Error("不认识的符号「" + ch + "」");
  }

  return tokens;
}

function evalConstantExpr(text) {
  var tokens = tokenizeExpr(text);
  if (!tokens.length) throw new Error("没有内容");

  var at = 0;

  function peek() { return tokens[at] || null; }
  function take() { return tokens[at++] || null; }

  function startsValue(t) {
    return !!t && (t.type === "num" || t.type === "name" || t.type === "(");
  }

  function parseExpr() {
    var value = parseTerm();
    while (true) {
      var t = peek();
      if (!t || (t.type !== "+" && t.type !== "-")) break;
      take();
      var rhs = parseTerm();
      value = t.type === "+" ? value + rhs : value - rhs;
    }
    return value;
  }

  function parseTerm() {
    var value = parseUnary();
    while (true) {
      var t = peek();
      if (t && (t.type === "*" || t.type === "/")) {
        take();
        var rhs = parseUnary();
        value = t.type === "*" ? value * rhs : value / rhs;
      } else if (startsValue(t)) {
        value = value * parseUnary();   // 隐式乘号：2pi、3(1+2)
      } else {
        break;
      }
    }
    return value;
  }

  function parseUnary() {
    var t = peek();
    if (t && (t.type === "+" || t.type === "-")) {
      take();
      var v = parseUnary();
      return t.type === "-" ? -v : v;
    }
    return parsePower();
  }

  function parsePower() {
    var base = parseAtom();
    var t = peek();
    if (t && t.type === "^") {
      take();
      return Math.pow(base, parseUnary());
    }
    return base;
  }

  function parseAtom() {
    var t = take();
    if (!t) throw new Error("表达式不完整");

    if (t.type === "num") return t.value;

    if (t.type === "(") {
      var inner = parseExpr();
      var close = take();
      if (!close || close.type !== ")") throw new Error("括号没有配对");
      return inner;
    }

    if (t.type === "name") {
      if (t.text === "pi") return Math.PI;
      if (t.text === "e") return Math.E;

      var fn = EXPR_FUNCS[t.text];
      if (!fn) throw new Error("不认识的函数或常量「" + t.text + "」");

      var open = peek();
      if (open && open.type === "(") {
        take();
        var arg = parseExpr();
        var closeParen = take();
        if (!closeParen || closeParen.type !== ")") throw new Error("括号没有配对");
        return fn(arg);
      }

      return fn(parsePower());   // 允许 √2 这种不带括号的写法
    }

    throw new Error("表达式里有无法识别的内容");
  }

  var result = parseExpr();
  if (at < tokens.length) throw new Error("表达式有多余的内容");
  if (!isFinite(result)) throw new Error("计算结果不是有限数");
  return result;
}

/* 读取一个数值框：空值返回 empty，非法表达式返回 error */
function parseCellValue(text) {
  var raw = normalizeExpr(text);
  if (raw === "") return { empty: true };
  try {
    return { value: evalConstantExpr(raw) };
  } catch (e) {
    return { error: e.message };
  }
}
