// Render approved canvas markup as static review evidence; never used by the app.
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../../client/package.json", import.meta.url),
);
const { JSDOM } = require("jsdom");
const source = await readFile(
  new URL(
    "../../docs/design/accounts/claude-artifact/Main.dc.html",
    import.meta.url,
  ),
  "utf8",
);
const document = new JSDOM(source).window.document;
const code = document.querySelector("script[data-dc-script]").textContent;
class DCLogic {
  constructor(props) {
    this.props = props;
  }
  setState(change) {
    Object.assign(this.state, change);
  }
}
const Component = new Function("DCLogic", code + ";return Component;")(DCLogic);
const font = (
  await readFile(
    new URL("../../client/src/v2/fonts/Newsreader.ttf", import.meta.url),
  )
).toString("base64");
const lookup = (expression, scope) => {
  const name = expression.trim();
  if (name === "true") return true;
  if (name === "false") return false;
  return name.split(".").reduce((value, key) => value?.[key], scope);
};
export function artifactReference({
  screen = "signUp",
  variant = "normal",
  device = "phone",
  light = "daylight",
  zoom = false,
} = {}) {
  const component = new Component({});
  component.setState({ screen, variant, device, light, zoom });
  const values = component.renderVals(),
    target = new JSDOM(
      '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>',
    ).window.document;
  const interpolate = (text, scope) =>
    text.replace(/{{\s*([^}]+)\s*}}/g, (_, key) =>
      String(lookup(key, scope) ?? ""),
    );
  const expression = (text, scope) =>
    lookup(text.replace(/^{{|}}$/g, ""), scope);
  const render = (node, scope) => {
    if (node.nodeType === 3)
      return [target.createTextNode(interpolate(node.textContent, scope))];
    if (node.nodeType !== 1) return [];
    if (node.localName === "sc-if")
      return expression(node.getAttribute("value"), scope)
        ? [...node.childNodes].flatMap((child) => render(child, scope))
        : [];
    if (node.localName === "sc-for")
      return (expression(node.getAttribute("list"), scope) || []).flatMap(
        (value) =>
          [...node.childNodes].flatMap((child) =>
            render(child, { ...scope, [node.getAttribute("as")]: value }),
          ),
      );
    const copy = target.createElement(node.localName);
    for (const attribute of node.attributes) {
      if (attribute.name.startsWith("on") || attribute.name.startsWith("hint-"))
        continue;
      const value = interpolate(attribute.value, scope);
      if (
        ["disabled", "checked", "selected"].includes(attribute.name) &&
        value === "false"
      )
        continue;
      copy.setAttribute(attribute.name, value);
    }
    copy.append(
      ...[...node.childNodes].flatMap((child) => render(child, scope)),
    );
    return [copy];
  };
  const style = target.createElement("style");
  style.textContent = `@font-face{font-family:Newsreader;src:url(data:font/ttf;base64,${font}) format('truetype');font-weight:200 800}${document.querySelector("helmet style").textContent}\nbody{margin:0}.app{width:100vw!important;height:100dvh!important;margin:0!important;border-radius:0;box-shadow:none}.zoomed{zoom:1}`;
  target.head.append(style);
  target.body.append(...render(document.querySelector(".app"), values));
  const html = "<!doctype html>" + target.documentElement.outerHTML;
  target.defaultView.close();
  return html;
}
