export async function mountAccountPage(root) {
  root.innerHTML = `<section class="section" style="padding-top:calc(var(--nav-h) + 4rem)"><div class="container"><h1>Editor login</h1><p class="lead">Coming in milestone 4.</p></div></section>`;
  return { name: 'account' };
}
