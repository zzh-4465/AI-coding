(function () {
  const getInvoke = () => window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke;

  async function invoke(command, args) {
    const tauriInvoke = getInvoke();
    if (!tauriInvoke) throw new Error("LifeOS desktop bridge is not available.");
    return tauriInvoke(command, args || {});
  }

  window.lifeosDesktop = {
    get enabled() {
      return Boolean(getInvoke());
    },
    invoke,
    openTarget(target) {
      return invoke("open_target", { target });
    },
    saveState(state) {
      return invoke("save_state", { state });
    },
    loadState() {
      return invoke("load_state");
    },
    setDailyLockScreen(pngDataUrl) {
      return invoke("set_daily_lock_screen", { pngDataUrl });
    },
    lockWorkstation() {
      return invoke("lock_workstation");
    },
    setWindowMode(mode) {
      return invoke("set_window_mode", { mode });
    },
    exportBackup(state) {
      return invoke("export_backup", { state });
    },
    openDataDir() {
      return invoke("open_data_dir");
    },
    getStartupStatus() {
      return invoke("get_startup_status");
    },
    setStartupEnabled(enabled) {
      return invoke("set_startup_enabled", { enabled });
    },
    minimizeWindow() {
      return invoke("minimize_window");
    },
    exitApp() {
      return invoke("exit_app");
    }
  };
})();
