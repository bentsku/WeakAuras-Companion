<template>
  <div class="app-update">
    <i
      v-if="status === 'update-available'"
      v-tooltip="
        `${this.$t(
          'app.main.installUpdate' /* Install client update */
        )}: v${version} ${releaseNotes}`
      "
      class="material-icons update-available"
      @click="open(`${path}`)"
      >system_update_alt
    </i>
    <i
      v-if="status === 'update-downloaded'"
      v-tooltip="
        `${this.$t(
          'app.main.installUpdate' /* Install client update */
        )}: v${version}`
      "
      class="material-icons update-available"
      @click="installUpdates"
      >system_update_alt
    </i>
    <div v-if="status === 'checking-for-update'" class="updating">
      <i class="material-icons icon">sync</i>
    </div>
    <div v-if="status === 'download-progress'" class="updating">
      <span class="progress">{{ progress }}%</span>
      <i class="material-icons icon">sync</i>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      status: null, // checking-for-update, update-available, update-not-available, error, download-progress, update-downloaded
      progress: null,
      scheduleId: null, // for 2h auto-updater
      version: null,
      path: null,
      releaseNotes: null,
      updateToast: null,
    };
  },
  mounted() {
    this.$electron.ipcRenderer.on("updaterHandler", (event, status, arg) => {
      console.log(`updaterHandler: ${status}`);

      if (status === "checkForUpdates") {
        this.version = arg.updateInfo.version;
        return;
      }
      this.status = status;

      if (status === "download-progress") {
        this.progress = Math.floor(arg.percent);
      }

      if (status === "update-available" && !this.updateToast) {
        this.path = `https://github.com/WeakAuras/WeakAuras-Companion/releases/download/v${arg.version}/${arg.path}`;
        this.releaseNotes = arg.releaseNotes || "";
        console.log(JSON.stringify(arg));

        // show download toast
        this.updateToast = this.message(
          this.$t("app.main.updatefound" /* Companion Update available */),
          null,
          {
            className: "update",
            duration: null,
            onComplete: () => {
              this.updateToast = null;
            },
          }
        );
      }

      if (status === "error") {
        this.message(
          [this.$t("app.main.updateerror" /* Error in updater */), arg.code],
          null,
          {
            className: "update update-error",
            duration: null,
          }
        );
      }

      if (status === "update-downloaded") {
        if (!this.updateToast) {
          this.updateToast = this.message(
            this.$t("app.main.updatedownload" /* Client update downloaded */),
            null,
            {
              className: "update",
              duration: null,
              onComplete: () => {
                this.updateToast = null;
              },
              action: [
                {
                  text: this.$t("app.main.install" /* Install */),
                  onClick: (e, toastObject) => {
                    this.$electron.ipcRenderer.send("installUpdates");
                    toastObject.goAway(0);
                  },
                },
                {
                  text: this.$t("app.main.later" /* Later */),
                  onClick: (e, toastObject) => {
                    toastObject.goAway(0);
                  },
                },
              ],
            }
          );
        }
      }
    });
  },
  methods: {
    installUpdates() {
      this.$electron.ipcRenderer.send("installUpdates");
    },
    open(link) {
      this.$electron.shell.openExternal(link);
    },
  },
};
</script>

<style></style>
