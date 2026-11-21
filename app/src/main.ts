import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import "./style.css";
import { setupBrowserMockBackend } from "./mocks/browserBackend";

// Setup browser mock IPC when running outside Tauri webview
setupBrowserMockBackend();

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);
app.mount("#app");
