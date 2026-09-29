export async function mountTeamPage(root, { team }) {
  root.innerHTML = `<section class="section" style="padding-top:calc(var(--nav-h) + 4rem)"><div class="container"><h1>${team.name}</h1><p class="lead">Resources coming in milestone 3.</p></div></section>`;
  return { name: 'team', slug: team.slug };
}
