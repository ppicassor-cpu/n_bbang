/**
 * find-raw-text.js
 * Usage:
 *   node "C:\n_bbang\tools\find-raw-text.js" "C:\n_bbang\src"
 *
 * Prints JSX children that can trigger:
 *   "Text strings must be rendered within a <Text> component."
 */
const fs = require("fs");
const path = require("path");

const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (["node_modules", ".expo", "android", "ios", "build"].includes(ent.name)) continue;
      walk(full, out);
    } else if (ent.isFile()) {
      if (/\.(js|jsx|ts|tsx)$/.test(ent.name)) out.push(full);
    }
  }
  return out;
}

function jsxName(node) {
  if (!node) return "UNKNOWN";
  if (node.type === "JSXIdentifier") return node.name;
  if (node.type === "JSXMemberExpression") return `${jsxName(node.object)}.${jsxName(node.property)}`;
  if (node.type === "JSXNamespacedName") return `${jsxName(node.namespace)}:${jsxName(node.name)}`;
  return "UNKNOWN";
}

function codeAt(src, node) {
  if (!node || typeof node.start !== "number" || typeof node.end !== "number") return "";
  return src.slice(node.start, node.end);
}

function hasStringishLiteral(expr) {
  if (!expr) return false;
  const t = expr.type;

  if (t === "StringLiteral" || t === "NumericLiteral" || t === "BooleanLiteral" || t === "BigIntLiteral") return true;
  if (t === "TemplateLiteral") return true;

  if (t === "BinaryExpression" || t === "LogicalExpression") {
    return hasStringishLiteral(expr.left) || hasStringishLiteral(expr.right);
  }
  if (t === "ConditionalExpression") {
    return hasStringishLiteral(expr.consequent) || hasStringishLiteral(expr.alternate);
  }
  if (t === "UnaryExpression") return hasStringishLiteral(expr.argument);
  if (t === "SequenceExpression") return Array.isArray(expr.expressions) && expr.expressions.some(hasStringishLiteral);

  return false;
}

function report(file, loc, kind, parentName, detail) {
  const p = path.resolve(file);
  const line = loc?.start?.line ?? "?";
  const col = loc?.start?.column ?? "?";
  console.log(`${p}:${line}:${col} [${kind}] parent=${parentName} ${detail}`);
}

const rootDir = process.argv[2];
if (!rootDir) {
  console.error('Usage: node tools/find-raw-text.js <rootDir>');
  process.exit(2);
}

const fileList = walk(path.resolve(rootDir));
let count = 0;

for (const file of fileList) {
  let src = "";
  try { src = fs.readFileSync(file, "utf8"); } catch { continue; }

  let ast;
  try {
    ast = parser.parse(src, {
      sourceType: "unambiguous",
      plugins: [
        "jsx",
        "typescript",
        "classProperties",
        "classPrivateProperties",
        "classPrivateMethods",
        "dynamicImport",
        "optionalChaining",
        "nullishCoalescingOperator",
        "objectRestSpread",
        "topLevelAwait",
        "decorators-legacy",
      ],
      errorRecovery: true,
      allowReturnOutsideFunction: true,
      ranges: true,
    });
  } catch (e) {
    console.error(`PARSE_FAIL ${file}: ${e.message}`);
    continue;
  }

  traverse(ast, {
    JSXElement(p) {
      const opening = p.node.openingElement;
      const parentName = jsxName(opening.name);

      // Treat <Text> as safe parent
      const isTextParent =
        parentName === "Text" ||
        parentName === "RNText" ||
        parentName.endsWith(".Text");

      if (isTextParent) return;

      for (const child of p.node.children || []) {
        if (!child) continue;

        // 1) Raw JSX text (non-whitespace) under non-Text => real error
        if (child.type === "JSXText") {
          const raw = child.value;
          if (raw && raw.replace(/\s+/g, "") !== "") {
            count++;
            report(file, child.loc, "RAW_TEXT", parentName, JSON.stringify(raw.trim()));
          }
          continue;
        }

        // 2) Expression container
        if (child.type === "JSXExpressionContainer") {
          const expr = child.expression;
          if (!expr || expr.type === "JSXEmptyExpression") continue;

          // Direct literals => real error
          if (["StringLiteral", "NumericLiteral", "BooleanLiteral", "BigIntLiteral"].includes(expr.type)) {
            count++;
            report(file, child.loc, "LITERAL_EXPR", parentName, codeAt(src, child).replace(/\s+/g, " ").trim());
            continue;
          }

          // Template literal => real error
          if (expr.type === "TemplateLiteral") {
            count++;
            report(file, child.loc, "TEMPLATE_EXPR", parentName, codeAt(src, child).replace(/\s+/g, " ").trim());
            continue;
          }

          // Conditional/logical/binary containing any literal => very likely culprit
          if (["ConditionalExpression", "LogicalExpression", "BinaryExpression"].includes(expr.type) && hasStringishLiteral(expr)) {
            count++;
            report(file, child.loc, "MAYBE_STRING_EXPR", parentName, codeAt(src, child).replace(/\s+/g, " ").trim());
            continue;
          }

          // Otherwise still show (helps spot {someString} / {format()} under View)
          if (["Identifier", "MemberExpression", "CallExpression", "OptionalCallExpression", "OptionalMemberExpression"].includes(expr.type)) {
            count++;
            report(file, child.loc, "MAYBE_EXPR", parentName, codeAt(src, child).replace(/\s+/g, " ").trim());
          }
        }
      }
    },

    JSXFragment(p) {
      const parentName = "Fragment";

      for (const child of p.node.children || []) {
        if (!child) continue;

        if (child.type === "JSXText") {
          const raw = child.value;
          if (raw && raw.replace(/\s+/g, "") !== "") {
            count++;
            report(file, child.loc, "RAW_TEXT", parentName, JSON.stringify(raw.trim()));
          }
        }

        if (child.type === "JSXExpressionContainer") {
          const expr = child.expression;
          if (!expr || expr.type === "JSXEmptyExpression") continue;

          if (["StringLiteral", "NumericLiteral", "BooleanLiteral", "BigIntLiteral", "TemplateLiteral"].includes(expr.type)) {
            count++;
            report(file, child.loc, "LITERAL_EXPR", parentName, codeAt(src, child).replace(/\s+/g, " ").trim());
          } else if (hasStringishLiteral(expr)) {
            count++;
            report(file, child.loc, "MAYBE_STRING_EXPR", parentName, codeAt(src, child).replace(/\s+/g, " ").trim());
          }
        }
      }
    },
  });
}

console.log(`\nFOUND: ${count}`);
process.exit(count ? 1 : 0);
