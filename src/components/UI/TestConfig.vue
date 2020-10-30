<template>
  <div>
    {{ config.wowpath.value }}<br />
    {{ versions }} <br />
    {{ accounts }} <br />
    {{ addOnsInstalled }} <br />
    <button
      v-for="{ value, text } in versionsLabels"
      :key="value"
      @click="selectVersion(value)"
    >
      {{ text }}
    </button>
    <div v-if="versionSelected">
      <button
        v-for="{ value } in accountsLabels"
        :key="value"
        @click="selectAccount(value)"
      >
        {{ value }}
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
            <td>{{ slug }}/{{ aura.id }}</td>
            <td>{{ aura.encoded ? "encoded" : "empty" }}</td>
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
const cache = require("../libs/cache.js");

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

const mergeAuraInfoFromWago = ({ aura, wagoAura, encoded }) => {
  return {
    ...aura,
    name: wagoAura.name,
    author: wagoAura.username,
    created: new Date(wagoAura.created),
    wagoSemver: wagoAura.versionString,
    wagoVersion: wagoAura.version,
    changelog: wagoAura.changelog,
    modified: new Date(wagoAura.modified),
    regionType: wagoAura.regionType,
    wagoid: wagoAura._id,
    encoded: encoded,
  };
};

const isTopLevel = (aura) => aura.topLevel || aura.regionType !== "group";

const compareVersion = (aura, wagoAura) => {
  return wagoAura.version > aura.version && wagoAura.version > aura.wagoVersion;
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
        accountsData: {},
      },
      cacheAuras: {},
      versionSelected: "",
      accountSelected: "",
      addonSelected: "",
    };
  },
  computed: {
    accountList() {
      return this.accounts[this.versionSelected] || [];
    },
    accountsLabels() {
      return this.accountList.map((account) => {
        return { value: account, text: account };
      });
    },
    versionsLabels() {
      const versionLabels = [
        {
          value: "_retail_",
          text: this.$t("app.version.retail" /* Retail */),
        },
        {
          value: "_ptr_",
          text: this.$t("app.version.ptr" /* PTR */),
        },
        {
          value: "_classic_beta_",
          text: this.$t("app.version.classicbeta" /* Classic Beta */),
        },
        {
          value: "_classic_ptr_",
          text: this.$t("app.version.classicptr" /* Classic PTR */),
        },
        {
          value: "_classic_",
          text: this.$t("app.version.classic" /* Classic */),
        },
        {
          value: "_beta_",
          text: this.$t("app.version.beta" /* Beta */),
        },
      ];
      return versionLabels.filter((version) =>
        this.versions.includes(version.value)
      );
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
    addOnsSavedVariablesPath() {
      return this.addOnsInstalled.map((addonConf) =>
        this.getAddonLuaFilePath(addonConf.addonName)
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
    // allow to cache the parsed auras when changing account. Need to check with it
    // if need to refetch, but i guess some minutes would be good
    // not the encoded string cache
    cachedAuras() {
      return this.cacheAuras[this.cacheKey];
    },
  },
  watch: {
    cacheKey: function (newVal, oldVal) {
      console.log(newVal, oldVal);
      const cached = this.cacheAuras[newVal];

      if (cached) this.auras = cached;

      const auras = this.getAllSavedVariablesAuras(console.log);
      this.auras = organizeAuraBySlug(auras);
      // this.getWagoData();
      // cache it after everything ??
      this.cacheAuras = { ...this.cacheAuras, [newVal]: this.auras };
    },
    cacheState: {
      handler(newVal) {
        console.log("update config");
        cache.default.setCacheConfig(newVal);
      },
      deep: true,
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

    // this.getAllSavedVariablesAuras()
    // DONT FORGET TO MERGE WITH CACHED DATA
    // when getting Cache data, need to be frozen?
    // then fetch
    // then write
    // save cache
    // then ? try backup I guess.
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
        return null;
      }
    },
    getAllSavedVariablesAuras(message) {
      return this.addOnsInstalled.reduce((acc, addonConf, index) => {
        const parser = ParserFactory.get(addonConf.addonName);
        // const savedVariablePath = this.getAddonLuaFilePath(addonConf.addonName);
        const savedVariablePath = this.addOnsSavedVariablesPath[index];
        console.log(parser, savedVariablePath);

        if (!parser || !savedVariablePath) return acc;

        try {
          const fileData = fs.readFileSync(savedVariablePath, "utf-8");
          const parsedAuras = parser.parse(fileData);
          acc.push(...parsedAuras);
          return acc;
        } catch (err) {
          // TODO CORRECT THIS, ITS WRONG
          this.message(
            `An error ocurred reading file: ${err.message}`,
            "error"
          );
          console.log(JSON.stringify(err));
          return acc;
        }
      }, []);
    },
    // getWagoData
    async updateAurasInfosWithWago() {
      const auras = Object.values(this.auras);
      let allAurasFetched = [];
      let received = [];
      const pendingPromisesWagoEncoded = [];
      const cachedAuras = this.getCachedAuras();

      this.addOnsInstalled.forEach(async (addonConf) => {
        const aurasToFetch = auras.reduce((accumulator, aura) => {
          if (
            aura.auraType === addonConf.addonName &&
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
            const { slug } = wagoAura;
            received.push(slug);
            const aura = mergeAuraWithCache(slug, cachedAuras[slug]);

            // Check if encoded string needs to be fetched
            if (needFetch({ aura, wagoAura, config: this.config })) {
              const promise = this.fetchAndUpdateRawEncoded(aura, wagoAura);
              // push promise ?
              pendingPromisesWagoEncoded.push(promise);
            }
          });
        } catch (err) {
          // throw Error("app.main.errorWagoAnswer");
          console.log(err);
        }
      });

      allAurasFetched.forEach((slug) => {
        if (!received.includes(slug)) {
          // this.auras = Object.keys(this.auras).reduce((auras, vslug) => {
          //   if (vslug !== slug) {
          //     auras[slug] = this.auras[slug];
          //   }
          //   return auras;
          // }, {});
          this.$delete(this.auras, slug);
          console.log(`no data received for ${slug}`);
        }
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
      return this.$http.get("https://data.wago.io/api/raw/encoded", {
        params: {
          id: slug,
        },
        headers: {
          Identifier: this.accountHash,
          "api-key": this.config.wagoApiKey || "",
        },
        crossdomain: true,
      });
    },
    async fetchAndUpdateRawEncoded(aura, wagoAura) {
      try {
        const { data: encoded, status } = await this.getAuraRawEncoded(
          aura.slug
        );

        this.auras[aura.slug] = mergeAuraInfoFromWago({
          aura,
          wagoAura,
          encoded,
        });
        cacheWagoAnswer(aura.slug);
        return { status: "success", slug: aura.slug };
      } catch (err) {
        this.message(
          [
            this.$t(
              "app.main.stringReceiveError-1",
              {
                aura: aura.name,
              } /* Error receiving encoded string for {aura} */
            ),
            this.$t(
              "app.main.stringReceiveError-2",
              {
                status,
              } /* http code: {status} */
            ),
          ],
          "error"
        );
        return { status: "error", slug: aura.slug };
      }
    },
    updateAuraEncodedString(slug, wagoAura, encoded) {
      this.auras[slug] = updateAuraInfoFromWago({
        aura,
        wagoAura,
        encoded,
      });
    },
    cacheWagoAnswer(aura) {
      const cachedAura = {
        encoded: aura.encoded,
        wagoVersion: aura.wagoVersion,
        wagoSemver: aura.wagoSemver,
        wagoid: aura.wagoid,
      };
      cache.default.setAura(this.cacheKey, cachedAura);
    },
    getCachedAuras() {
      return cache.default.getCacheAurasByKey(this.cacheKey, {});
    },
    mergeAuraWithCache(slug, cache) {
      const aura = this.auras[slug];

      if (!cache.encoded) return aura;

      this.auras[slug] = {
        ...aura,
        ...cache,
      };
      return aura;
    },
    message(text, type, overrideOptions = {}) {
      const options = {
        theme: "toasted-primary",
        position: "bottom-right",
        duration: 8000,
        action: {
          text: this.$t("app.main.close" /* Close */),
          onClick: (e, toastObject) => {
            toastObject.goAway(0);
          },
        },
        ...overrideOptions,
      };

      let msg;

      if (typeof text === "object") {
        const div = document.createElement("div");
        div.className = "msg";
        div.innerHTML += text[0];

        for (let i = 1; i < text.length; i += 1) {
          const line = document.createElement("span");
          line.className = "small-text";
          line.innerHTML += text[i];
          div.appendChild(line);
        }

        options.className = options.className
          ? `${options.className} multiline`
          : "multiline";
        msg = div;
      } else {
        msg = text;
      }

      if (type === "info") return this.$toasted.info(msg, options);
      else if (type === "error") return this.$toasted.error(msg, options);
      return this.$toasted.show(msg, options);
    },
    open(link) {
      this.$electron.shell.openExternal(link);
    },
  },
};
// Set all auras topLevel = null to avoid bugs after user move his auras // TODO ?????? shouldnt be here ? seems to be work around ??
// only for weakauras, before parsing
// as I reparsed and dont use the cache for rewriting top level, shouldnt bug anymore because using fresh data from SV
// this.auras
//   .filter((aura) => aura.auraType === config.addonName)
//   .forEach((aura, index) => {
//     this.auras[index].topLevel = null;
//   });
</script>
