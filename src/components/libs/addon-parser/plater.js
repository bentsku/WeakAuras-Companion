const luaparse = require("luaparse");

const PlaterParser = {
  parse(platerSavedDataFile) {
    const luaData = luaparse.parse(platerSavedDataFile);
    const aurasFromFile = [];

    if (luaData.body[0].variables[0].name !== "PlaterDB") {
      this.message(
        this.$t(
          "app.main.errorSavedvariablePlater" /* Error while reading Plater.lua */
        ),
        "error"
      );
      //this.fetching = false;
      return;
    }

    const pattern = /(https:\/\/wago.io\/)([^/]+)/;

    luaData.body[0].init[0].fields.forEach((obj) => {
      if (obj.key.value === "profiles") {
        obj.value.fields.forEach((profile) => {
          let profslug;
          let profurl;
          let profversion = 0;
          let profsemver;
          let profignoreWagoUpdate = false;
          let profskipWagoUpdate = null;
          let profid;

          profile.value.fields.forEach((profData) => {
            switch (profData.key.value) {
              case "Name":
                profid = profData.value.value;
                break;
              case "version":
                profversion = Number(profData.value.value);
                break;
              case "semver":
                profsemver = profData.value.value;
                break;
              case "ignoreWagoUpdate":
                profignoreWagoUpdate = profData.value.value;
                break;
              case "skipWagoUpdate":
                profskipWagoUpdate = profData.value.value;
                break;

              case "url": {
                profurl = profData.value.value;
                const result = profurl.match(pattern);

                if (result) ({ 2: profslug } = result);
                break;
              }
              case "script_data":

              case "hook_data": {
                let typeSuffix =
                  profData.key.value === "hook_data"
                    ? "-Mod"
                    : profData.key.value === "script_data"
                    ? "-Script"
                    : "";

                profData.value.fields.forEach((obj2) => {
                  let slug;
                  let url;
                  let version = 0;
                  let semver;
                  let ignoreWagoUpdate = false;
                  let skipWagoUpdate = null;
                  let id;

                  obj2.value.fields.forEach(({ key, value }) => {
                    switch (key.value) {
                      case "Name":
                        id = value.value;
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
                      topLevel: true,
                      uids: [],
                      regionType: null,
                      auraType: "Plater",
                      auraTypeDisplay: "Plater" + typeSuffix,
                    };

                    aurasFromFile.push(foundAura);
                  }
                });
              }
            }
          });

          if (profslug) {
            const foundAura = {
              id: profid,
              slug: profslug,
              version: profversion,
              semver: profsemver,
              ignoreWagoUpdate: profignoreWagoUpdate,
              skipWagoUpdate: profskipWagoUpdate,
              wagoVersion: null,
              wagoSemver: null,
              changelog: null,
              created: null,
              modified: null,
              author: null,
              encoded: null,
              wagoid: null,
              ids: [profid],
              topLevel: true,
              uids: [],
              regionType: null,
              auraType: "Plater",
              auraTypeDisplay: "Plater" + "-Profile",
            };

            aurasFromFile.push(foundAura);
          }
        });
      }
    });

    return aurasFromFile;
  },
};

export default PlaterParser;
