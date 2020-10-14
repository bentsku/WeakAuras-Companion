import Vue from "vue";
import path from "path";

const userDataPath = require("electron").remote.app.getPath("userData");

const initDefaultValues = () => {
  return {
    // everything in this object will be auto-save and restore
    wowpath: {
      value: "",
      versions: [],
      version: "",
      valided: false,
    },
    wagoUsername: null, // ignore your own auras
    wagoApiKey: null,
    ignoreOwnAuras: true,
    autostart: false,
    startminimize: false,
    notify: false,
    lang: "en",
    showAllAuras: false,
    autoupdate: false,
    beta: null,
    internalVersion: 3, // delete this with electron-store migration
    backup: {
      active: true,
      path: path.join(userDataPath, "WeakAurasData-Backup"),
      maxsize: 100,
      defaultBackupPath: path.join(userDataPath, "WeakAurasData-Backup"),
    },
  };
};

export const config = Vue.observable(initDefaultValues());

export const resetConfig = () => (config = initDefaultValues());

export const mergeConfigWithStore = (storeConfig) => {
  return { ...config, ...storeConfig };
};
