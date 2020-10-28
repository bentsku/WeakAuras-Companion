<template>
  <div>
    {{ config.wowpath.value }}<br />
    {{ versions }} <br />
    {{ accounts }} <br />
    {{ addOnsInstalled }} <br />
    <button
      v-for="version in versions"
      :key="version"
      @click="selectVersion(version)"
    >
      {{ version }}
    </button>
    <div v-if="versionSelected">
      <button
        v-for="account in accountList"
        :key="account"
        @click="selectAccount(account)"
      >
        {{ account }}
      </button>
    </div>
    <span>Cachekey: {{ cacheKey }} </span>
    <div>Slugs: {{ aurasSlugsByType }}</div>
    <div style="overflow-y: auto; height: 200px; width: 90%">
      <table>
        <thead>
          <tr>
            <th>H1</th>
            <th>H2</th>
            <th>H3</th>
            <th>H4</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(aura, slug) in auras" :key="aura.slug">
            <td>{{ aura.id }}</td>
            <td>{{ slug }}</td>
            <td>{{ aura.auraType }}</td>
            <td>{{ aura.wagoVersion }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script>
const fs = require("fs");
const path = require("path");
import { ParserFactory } from "../libs/addon-parser";
const hash = require("../libs/hash.js");

const getVersions = (wowpath) => {
  try {
    const files = fs.readdirSync(wowpath);

    return files.filter((versionDir) => {
      if (
        versionDir.match(/^_.*_$/) &&
        fs.statSync(path.join(wowpath, versionDir)).isDirectory()
      ) {
        const accountFolder = path.join(wowpath, versionDir, "WTF", "Account");
        return fs.existsSync(accountFolder);
      }
    });
  } catch (err) {
    console.log(err);
    return [];
  }
};

const getAccounts = (wowpath, version) => {
  const accountsFolder = path.join(wowpath, version, "WTF", "Account");

  try {
    const accountFolders = fs.readdirSync(accountsFolder);

    return accountFolders.filter(
      (accountFile) =>
        accountFile !== "SavedVariables" &&
        fs.statSync(path.join(accountsFolder, accountFile)).isDirectory()
    );
  } catch (err) {
    console.log(`Error: ${err}`);
    return [];
  }
};

const testState = {
  _ptr_: "Kirin Tor",
};

const ADDON_CONFIGS = [
  {
    addonName: "WeakAuras",
    wagoAPI: "https://data.wago.io/api/check/weakauras",
    dataIndex: null,
    addonDependency: "WeakAuras",
    hasTypeColumn: false,
  },
  {
    addonName: "Plater",
    wagoAPI: "https://data.wago.io/api/check/plater",
    dataIndex: "Plater",
    addonDependency: "Plater",
    hasTypeColumn: true,
  },
];

const mergeAuraBySlug = (aura, { uid, id }) => {
  try {
    return {
      ...aura,
      ids: aura.ids.includes(id) ? [...aura.ids, id] : aura.ids,
      uids: uid && !aura.uids.includes(uid) ? [...aura.uids, uid] : aura.uids,
      encoded: aura.ignoreWagoUpdate ? null : aura.encoded,
    };
  } catch (err) {
    console.log(err);
  }
};

const joinBySlug = (auraArray) => {
  const auraMappedBySlug = auraArray.reduce((auraMap, aura) => {
    // merge here
    if (auraMap[aura.slug])
      auraMap[aura.slug] = mergeAuraBySlug(auraMap[aura.slug], aura);
    // init here
    else auraMap[aura.slug] = aura;
    return auraMap;
  }, {});
  return auraMappedBySlug;
};

const organizeAuraBySlug = (parsedAddonData) => {
  return joinBySlug(parsedAddonData);
};

const updateAuraInfoFromWago = (aura, auraInfo) => {
  return {
    ...aura,
    name: auraInfo.name,
    author: auraInfo.username,
    created: new Date(auraInfo.created),
    wagoSemver: auraInfo.versionString,
    changelog: auraInfo.changelog,
    modified: new Date(auraInfo.modified),
    regionType: auraInfo.regionType,
    wagoid: auraInfo._id,
  };
};

const isTopLevel = (aura) => aura.topLevel || aura.regionType !== "group";

const compareVersion = (aura, wagoAura) => {
  return (
    wagoAura.version > aura.version &&
    !!wagoAura.wagoVersion &&
    wagoAura.version > aura.wagoVersion
  );
};

const isOwnAura = (aura, username) => {
  return !!aura.author && aura.author === username;
};

const needFetch = ({
  aura,
  wagoAura,
  config: { ignoreOwnAuras, wagoUsername },
}) => {
  return (
    !aura.ignoreWagoUpdate &&
    isTopLevel(aura) &&
    !(ignoreOwnAuras && isOwnAura(aura, wagoUsername)) &&
    (aura.encoded === null || compareVersion(aura, wagoAura))
  );
};

function syncMatchFolderNameInsensitive(folder, name, create) {
  try {
    const files = fs.readdirSync(folder);

    if (files === undefined) throw Error(`Folder ${folder} doesnt exist`);

    const folderFound = files.find(
      (filename) => filename.toLowerCase() === name.toLowerCase()
    );

    if (folderFound) return folderFound;

    if (!!create) {
      fs.mkdir(path.join(folder, name), (err) => {
        if (err && err.code !== "EEXIST") {
          this.message(
            this.$t(
              "app.main.errorCantCreateAddon" /* Can't create addon directory */
            ),
            "error"
          );
          console.log(JSON.stringify(err));
          throw new Error("errorCantCreateAddon");
        }
      });
      return name;
    }
  } catch (err) {
    console.log(err);
    throw Error(`${name} not found at ${folder}`);
  }
}

function syncGetAddonFolder(baseDir, addonName, create = false) {
  let addonFolder = baseDir;
  const addonPath = ["Interface", "AddOns", addonName];

  while (addonPath.length) {
    const check = addonPath.shift();

    try {
      var folder = syncMatchFolderNameInsensitive(addonFolder, check, create);

      if (folder) addonFolder = path.join(addonFolder, folder);
      else return null;
    } catch (err) {
      console.log(err);
      return null;
    }
  }
  return addonFolder;
}

export default {
  name: "TestConfig",
  props: ["config"],
  data() {
    return {
      normalizedData: {},
      versions: [],
      accounts: {},
      auras: {},
      cacheState: {
        versionSelected: "",
        accountSelectedByVersion: {},
        auras: {},
        accountsData: {},
      },
      versionSelected: "",
      accountSelected: "",
    };
  },
  computed: {
    accountList() {
      return this.accounts[this.versionSelected] || [];
    },
    accountHash() {
      if (this.versionSelected && this.accountSelected) {
        return hash.hashFnv32a(this.accountSelected, true);
      }
      return null;
    },
    cacheKey() {
      if (this.versionSelected && this.accountSelected)
        return `${this.versionSelected}:${this.accountSelected}`;
      else return null;
    },
    addOnsInstalled() {
      if (!this.config.wowpath.value || !this.versionSelected) return [];
      const baseDir = path.join(
        this.config.wowpath.value,
        this.versionSelected
      );

      return ADDON_CONFIGS.filter((conf) =>
        syncGetAddonFolder(baseDir, conf.addonName)
      );
    },
    aurasSlugsByType() {
      const auras = Object.values(this.auras);
      return auras.reduce((acc, { auraType, slug }) => {
        if (!acc[auraType]) acc[auraType] = [];
        acc[auraType].push(slug);
        return acc;
      }, {});
    },
    cachedAuras() {
      return this.cacheState.auras[this.cacheKey];
    },
  },
  watch: {
    cacheKey: function (newVal, oldVal) {
      console.log(newVal, oldVal);
      const cached = this.cacheState.auras[newVal];

      if (cached) this.auras = cached;

      const auras = this.getAllSavedVariablesAuras(console.log);
      this.auras = organizeAuraBySlug(auras);
      // this.getWagoData();

      this.cacheState.auras = { ...this.cacheState.auras, newVal: this.auras };
    },
  },
  mounted() {
    this.versions = getVersions(this.config.wowpath.value);

    this.cacheState.accountSelectedByVersion = this.versions.reduce(
      (acc, version) => {
        if (!acc[version]) acc[version] = "";
        return acc;
      },
      { ...testState }
    );

    this.cacheState.accountsData = this.versions.reduce((acc, version) => {
      if (!acc[version]) {
        acc[version] = {
          lastWagoUpdate: null,
          savedvariableSizeForAddon: {},
        };
      }
      return acc;
    }, {});

    this.accounts = this.versions.reduce((acc, version) => {
      acc[version] = getAccounts(this.config.wowpath.value, version);
      return acc;
    }, {});
    this.versionSelected = this.cacheState.versionSelected;

    this.accountSelected = this.cacheState.accountSelectedByVersion[
      this.versionSelected
    ];
  },
  methods: {
    selectVersion(version) {
      this.versionSelected = version;
      this.cacheState.versionSelected = version;
      const cached = this.cacheState.accountSelectedByVersion[version];

      if (cached && this.accounts[version].includes(cached))
        this.accountSelected = cached;
      else this.accountSelected = "";
    },
    selectAccount(account) {
      this.accountSelected = account;
      this.cacheState.accountSelectedByVersion[this.versionSelected] = account;
    },
    getAddonLuaFilePath(addon) {
      let addonSavedVariablesLuaFile = path.join(
        this.config.wowpath.value,
        this.versionSelected,
        "WTF",
        "Account",
        this.accountSelected,
        "SavedVariables",
        `${addon}.lua`
      );

      try {
        fs.accessSync(addonSavedVariablesLuaFile, fs.constants.F_OK);
        return addonSavedVariablesLuaFile;
      } catch (e) {
        return "";
      }
    },
    getAllSavedVariablesAuras(message) {
      return this.addOnsInstalled.reduce((acc, addonConf) => {
        const parser = ParserFactory.get(addonConf.addonName);
        const savedVariablePath = this.getAddonLuaFilePath(addonConf.addonName);
        console.log(parser, savedVariablePath);

        if (!parser || !savedVariablePath) return acc;

        try {
          const fileData = fs.readFileSync(savedVariablePath, "utf-8");
          const parsedAuras = parser.parse(fileData);
          acc.push(...parsedAuras);
          return acc;
        } catch (err) {
          message(`An error occurred reading file: ${err.message}`, "error");
          console.log(JSON.stringify(err));
          return acc;
        }
      }, []);
    },
    async getWagoData() {
      const auras = Object.values(this.auras);
      let allAurasFetched = [];
      let received = [];
      const pendingPromisesWagoEncoded = [];

      this.addOnsInstalled.forEach(async (addonConf) => {
        const aurasToFetch = auras.reduce((accumulator, aura) => {
          if (
            !(
              this.config.ignoreOwnAuras &&
              isOwnAura(aura, this.config.wagoUsername)
            )
          ) {
            accumulator.push(aura.slug);
          }
          return accumulator;
        }, []);

        if (aurasToFetch.length === 0) return;
        allAurasFetched = [...allAurasFetched, ...aurasToFetch];

        try {
          const { data: wagoAuras } = await this.getAurasInfoFromWago(
            addonConf.wagoAPI,
            aurasToFetch
          );

          wagoAuras.forEach((wagoAura) => {
            received.push(wagoAura.slug);
            const aura = this.auras[wagoAura.slug];

            if (aura) {
              this.auras[wagoAura.slug] = updateAuraInfoFromWago(
                aura,
                wagoAura
              );
            }

            // Check if encoded string needs to be fetched
            if (needFetch({ aura, wagoAura, config: this.config })) {
              // push promise ?
              pendingPromisesWagoEncoded.push(
                this.getAuraRawEncoded(aura.slug)
              );

              this.auras[wagoAura.slug] = {
                ...aura,
                wagoVersion: wagoAura.version,
              };
            }
          });
        } catch (err) {
          // throw Error("app.main.errorWagoAnswer");
          console.log(err);
        }
      });
      const notReceived = allAurasFetched.filter((slug) =>
        received.includes(slug)
      );

      notReceived.forEach((slug) => {
        delete this.auras[slug];
        console.log(`no data received for ${slug}`);
      });

      if (pendingPromisesWagoEncoded.length === 0) return [];
      return await Promise.all(pendingPromisesWagoEncoded);
    },

    getAurasInfoFromWago(wagoApiUrl, aurasSlug) {
      return this.$http.get(wagoApiUrl, {
        params: {
          // !! size of request is not checked, can lead to too long urls
          ids: aurasSlug.join(),
        },
        headers: {
          Identifier: this.accountHash,
          "api-key": this.config.wagoApiKey || "",
        },
        crossdomain: true,
      });
    },

    getAuraRawEncoded(slug) {
      return this.$http
        .get("https://data.wago.io/api/raw/encoded", {
          params: {
            // eslint-disable-next-line no-underscore-dangle
            id: slug,
          },
          headers: {
            Identifier: this.accountHash,
            "api-key": this.config.wagoApiKey || "",
          },
          crossdomain: true,
        })
        .catch((err) => ({
          config: { params: { id: err.config.params.id } },
          status: err.response.status,
        }));
    },
    updateAurasEncodedString(wagoResponses, msg, tr) {
      const news = [];
      const fails = [];

      wagoResponses.forEach((wagoResp) => {
        const { id } = wagoResp.config.params;
        const aura = this.auras[id];

        if (wagoResp.status === 200) {
          this.auras[id] = { ...aura[id], encoded: wagoResp.data };
          // aura.encoded = wagoResp.data
          news.push(aura.name);
        } else {
          msg(
            [
              tr(
                "app.main.stringReceiveError-1",
                {
                  aura: aura.name,
                } /* Error receiving encoded string for {aura} */
              ),
              tr(
                "app.main.stringReceiveError-2",
                {
                  status: wagoResp.status,
                } /* http code: {status} */
              ),
            ],
            "error"
          );
          fails.push(aura.name);
        }
      });
      return { auras: aurasMap, news, fails };
    },
  },
};
</script>
