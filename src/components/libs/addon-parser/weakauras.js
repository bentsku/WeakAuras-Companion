const luaparse = require("luaparse");
luaparse.defaultOptions.comments = false;
luaparse.defaultOptions.scope = true;

const WeakAurasParser = {
  parse(weakAurasSavedDataFile) {
    const luaData = luaparse.parse(weakAurasSavedDataFile);
    const aurasFromFile = [];

    if (luaData.body[0].variables[0].name !== "WeakAurasSaved") {
      this.message(
        this.$t(
          "app.main.errorSavedvariable" /* Error while reading WeakAuras.lua */
        ),
        "error"
      );
      return [];
    }
    // throw Error("errorSavedVariablesWeakAurasSaved");
    // throw error for that !!

    // Set all auras topLevel = null to avoid bugs after user move his auras // TODO ?????? shouldnt be here ? seems to be work around ??
    // this.auras
    //   .filter((aura) => aura.auraType === config.addonName)
    //   .forEach((aura, index) => {
    //     this.auras[index].topLevel = null;
    //   });

    const pattern = /(https:\/\/wago.io\/)([^/]+)/;

    luaData.body[0].init[0].fields.forEach((obj) => {
      if (obj.key.value === "displays") {
        obj.value.fields.forEach((obj2) => {
          let slug;
          let url;
          let version = 0;
          let semver;
          let ignoreWagoUpdate = false;
          let skipWagoUpdate = null;
          let id;
          let uid = null;
          let topLevel = true;

          obj2.value.fields.forEach(({ key, value }) => {
            switch (key.value) {
              case "id":
                id = value.value;
                break;
              case "uid":
                uid = value.value;
                break;
              case "version":
                version = Number(value.value);
                break;
              case "semver":
                semver = value.value;
                break;
              case "ignoreWagoUpdate":
                ignoreWagoUpdate = value.value;
                break;
              case "skipWagoUpdate":
                skipWagoUpdate = value.value;
                break;

              case "url": {
                url = value.value;
                const result = url.match(pattern);

                if (result) ({ 2: slug } = result);
                break;
              }
              case "parent":
                topLevel = false;
                break;
            }
          });

          if (slug) {
            const foundAura = {
              id,
              slug,
              version,
              semver,
              ignoreWagoUpdate,
              skipWagoUpdate,
              wagoVersion: null,
              wagoSemver: null,
              changelog: null,
              created: null,
              modified: null,
              author: null,
              encoded: null,
              wagoid: null,
              ids: [id],
              topLevel: topLevel ? id : null,
              uids: uid ? [uid] : [],
              regionType: null,
              auraType: "WeakAuras",
              auraTypeDisplay: null,
            };
            aurasFromFile.push(foundAura);
          }
        });
      }
    });

    return aurasFromFile;
  },
};

export default WeakAurasParser;
