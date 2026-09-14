const NAV_COPY = {
  "zh-TW": {
    title: "台鐵時刻表查詢",
    language: "選擇語言",
    theme: "切換深淺色模式",
    stations: "車站資訊",
    guide: "使用說明",
    about: "資料來源",
    news: "最新消息",
    api: "JSON 資源",
  },
  en: {
    title: "TRA Timetable",
    language: "Select language",
    theme: "Toggle color theme",
    stations: "Stations",
    guide: "Guide",
    about: "Data source",
    api: "JSON resources",
  },
  ja: {
    title: "台湾鉄道時刻表",
    language: "言語を選択",
    theme: "配色を切り替える",
    stations: "駅情報",
    guide: "使い方",
    about: "データソース",
    api: "JSON リソース",
  },
};

function normalPath(path) {
  return path.endsWith("/") ? path : `${path}/`;
}

class SiteNav extends HTMLElement {
  static observedAttributes = ["locale"];

  get locale() {
    const requested = this.getAttribute("locale") || new URLSearchParams(location.search).get("lang");
    if (NAV_COPY[requested]) return requested;
    if (location.pathname.startsWith("/en/")) return "en";
    if (location.pathname.startsWith("/ja/")) return "ja";
    return "zh-TW";
  }

  get pagePath() {
    return normalPath(location.pathname.replace(/^\/(en|ja)(?=\/)/, "") || "/");
  }

  pathFor(locale, path) {
    if (path === "/api/") return "/api/";
    return locale === "zh-TW" ? path : `/${locale}${path}`;
  }

  languagePath(locale) {
    if (this.pagePath === "/app/") return locale === "zh-TW" ? "/app/" : `/app/?lang=${locale}`;
    if (this.pagePath === "/news/") return locale === "zh-TW" ? "/news/" : `/${locale}/`;
    return this.pathFor(locale, this.pagePath);
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    this.render();
  }

  render() {
    try {
      if (localStorage.getItem("tra.theme") === "dark") {
        document.documentElement.classList.add("theme-dark");
        document.documentElement.style.colorScheme = "dark";
      }
    } catch {}

    const locale = this.locale;
    const copy = NAV_COPY[locale];
    const links = [
      ["/stations/", copy.stations],
      ["/guide/", copy.guide],
      ["/about/", copy.about],
      ...(locale === "zh-TW" ? [["/news/", copy.news]] : []),
      ["/api/", copy.api],
    ];
    const currentPath = this.pagePath;
    const homeUrl = locale === "zh-TW" ? "/" : `/${locale}/`;

    this.innerHTML = `<header class="site-header"><div class="site-nav-wrap"><a class="site-brand" href="${homeUrl}">${copy.title}</a><nav class="site-nav-links" aria-label="Site navigation">${links.map(([path, label]) => `<a href="${this.pathFor(locale, path)}"${path === currentPath ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav><div class="site-controls"><select aria-label="${copy.language}"><option value="${this.languagePath("zh-TW")}"${locale === "zh-TW" ? " selected" : ""}>中文</option><option value="${this.languagePath("en")}"${locale === "en" ? " selected" : ""}>EN</option><option value="${this.languagePath("ja")}"${locale === "ja" ? " selected" : ""}>日本語</option></select><button type="button" aria-label="${copy.theme}" title="${copy.theme}"><span aria-hidden="true">◐</span></button></div></div></header>`;

    const select = this.querySelector("select");
    select.addEventListener("change", () => { location.href = select.value; });
    this.querySelector("button").addEventListener("click", () => {
      const isDark = document.documentElement.classList.toggle("theme-dark");
      document.documentElement.style.colorScheme = isDark ? "dark" : "light";
      try { localStorage.setItem("tra.theme", isDark ? "dark" : "light"); } catch {}
    });
  }
}

customElements.define("site-nav", SiteNav);
