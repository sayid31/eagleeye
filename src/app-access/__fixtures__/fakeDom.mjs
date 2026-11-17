// Minimal DOM stand-in for app-access unit tests (no DOM library in this repo).
// Supports just what accessBanner.js / accessEffects.js touch.

class FakeElement {
  constructor(tag, doc) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = doc;
    this.children = [];
    this.parent = null;
    this.attributes = {};
    this.listeners = {};
    this.textContent = '';
    this.title = '';
    this.type = '';
    this.className = '';
    const classes = new Set();
    this.classList = {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
    };
  }

  get id() { return this.attributes.id ?? ''; }
  set id(value) { this.attributes.id = String(value); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  replaceChildren() { this.children = []; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this); this.parent = null; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  click() { for (const fn of this.listeners.click ?? []) fn({ target: this }); }
  /** Depth-first descendants. */
  *walk() { for (const child of this.children) { yield child; yield* child.walk(); } }
  find(predicate) { for (const node of this.walk()) if (predicate(node)) return node; return null; }
}

/** @returns {Document-like} */
export function createFakeDocument() {
  const doc = {
    createElement: (tag) => new FakeElement(tag, doc),
    getElementById: (id) => doc.body.find((node) => node.id === id),
  };
  doc.body = new FakeElement('body', doc);
  return doc;
}
