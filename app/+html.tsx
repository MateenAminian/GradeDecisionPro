import { ScrollViewStyleReset } from 'expo-router/html';

/** Stop Expo's classic bundle <script> from parsing import.meta. Load the bundle as a module instead. */
const blockClassicBundle = `
(function () {
  function isMetroBundle(src) {
    src = String(src || '');
    return src.indexOf('entry.bundle') !== -1 || /\\/_expo\\/.+\\.js(\\?|$)/.test(src);
  }
  function isOurModule(node) {
    return node && (node.type === 'module' || (node.getAttribute && node.getAttribute('data-gdp-module') === '1'));
  }
  function block(node) {
    if (!node || node.tagName !== 'SCRIPT' || isOurModule(node)) return;
    var src = node.getAttribute('src') || node.src || '';
    if (!isMetroBundle(src)) return;
    node.type = 'text/plain';
    node.removeAttribute('src');
    try { node.src = ''; } catch (e) {}
  }
  var origSet = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    if (this.tagName === 'SCRIPT' && String(name).toLowerCase() === 'src' && isMetroBundle(value) && !isOurModule(this)) {
      origSet.call(this, 'type', 'text/plain');
      return;
    }
    return origSet.apply(this, arguments);
  };
  var desc = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
  if (desc && desc.set) {
    Object.defineProperty(HTMLScriptElement.prototype, 'src', {
      configurable: true,
      enumerable: desc.enumerable,
      get: desc.get,
      set: function (value) {
        if (isMetroBundle(value) && !isOurModule(this)) {
          this.type = 'text/plain';
          return;
        }
        return desc.set.call(this, value);
      }
    });
  }
  new MutationObserver(function (records) {
    records.forEach(function (record) {
      record.addedNodes.forEach(block);
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
`;

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: responsiveBackground }} />
        <script dangerouslySetInnerHTML={{ __html: blockClassicBundle }} />
      </head>
      <body>
        {children}
        <script
          type="module"
          data-gdp-module="1"
          src="/node_modules/expo-router/entry.bundle?platform=web&dev=true&hot=false&lazy=true&transform.routerRoot=app"
        />
      </body>
    </html>
  );
}

const responsiveBackground = `
html, body, #root {
  height: 100%;
  width: 100%;
}
body {
  background-color: #0C0F17;
  margin: 0;
}
#root {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  flex: 1;
}
`;
