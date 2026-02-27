type Page = "home" | "problems" | "demos" | "game";

const links: { page: Page; label: string; href: string }[] = [
  { page: "problems", label: "Problems", href: "/problems.html" },
  { page: "demos", label: "Demos", href: "/demos.html" },
  { page: "game", label: "Game", href: "/game.html" },
];

export function renderNav(active: Page): void {
  const nav = document.createElement("nav");
  nav.className = "site-nav";

  const logo = document.createElement("a");
  logo.href = "/";
  logo.className = "nav-logo";
  logo.textContent = "wasmize";

  const ul = document.createElement("ul");
  ul.className = "nav-links";

  for (const { page, label, href } of links) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = href;
    a.textContent = label;
    if (page === active) a.classList.add("active");
    li.appendChild(a);
    ul.appendChild(li);
  }

  nav.appendChild(logo);
  nav.appendChild(ul);
  document.body.prepend(nav);
}
