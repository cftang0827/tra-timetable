import { createApp } from "vue";
import App from "./App.vue";
import "./style.css";
import { registerSW } from "virtual:pwa-register";


createApp(App).mount("#app");
registerSW({ immediate: true });

