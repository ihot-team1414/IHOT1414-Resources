// Editor styles load only for editors (and on the login page).
let loaded = null;
export function loadEditorCss() {
  if (loaded) return loaded;
  loaded = new Promise((resolve) => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'css/editor.css';
    l.onload = resolve;
    l.onerror = resolve;
    document.head.appendChild(l);
  });
  return loaded;
}
