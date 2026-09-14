import { createApp } from "vue";
import App from "./App.vue";
import "./style.css";
import { registerSW } from "virtual:pwa-register";
import { i18n } from "./i18n";

const app = createApp(App);
app.config.compilerOptions.isCustomElement = (tag) => tag === "site-nav";
app.use(i18n).mount("#app");
registerSW({ immediate: true });
