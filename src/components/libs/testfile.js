const luaparse = require("luaparse");
import ParserFactory from "./addon-parser";
import { getAddonLuaFilePath } from "./wowscan";
import axios from "axios";
import sanitize from "./sanitize";
import fs from "fs/promises";
import { fstatSync } from "fs";

axios.defaults.timeout = 15000;

const mergeAllSavedVariablesData = (addonConfigs, message) => {
  return addonConfigs.reduce((acc, addonConf) => {
    const parser = ParserFactory.get(addonConf.name);
    const savedVariablePath = getAddonLuaFilePath(addonConf.name);

    if (!parser || !savedVariablePath) return acc;

    try {
      const data = fs.readFileSync(savedVariablePath, "utf-8");
      // Parse saved data .lua
      const savedData = luaparse.parse(data);
      const parsedAuras = parser(savedData);
      acc.push(parsedAuras);
      return acc;
    } catch (err) {
      message(`An error ocurred reading file: ${err.message}`, "error");
      console.log(JSON.stringify(err));
      return acc;
    }
  }, []);
};

const mergeAuraBySlug = (aura, { uid, id }) => {
  return {
    ...aura,
    ids: aura.ids.includes(id) ? [...aura.ids, id] : aura.ids,
    uids: uid && !aura.uids.includes(uid) ? [...aura.uids, uid] : aura.uids,
    encoded: aura.ignoreWagoUpdate ? null : aura.encoded,
  };
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

const buildAuraList = (parsedAddonData) => {
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

const getAurasInfoFromWago = (
  wagoApiUrl,
  aurasSlug,
  accountHash,
  wagoApiKey
) => {
  return axios.get(wagoApiUrl, {
    params: {
      // !! size of request is not checked, can lead to too long urls
      ids: aurasSlug.join(),
    },
    headers: {
      Identifier: accountHash,
      "api-key": wagoApiKey || "",
    },
    crossdomain: true,
  });
};

const getAuraRawEncoded = (slug, wagoApiKey) => {
  return axios
    .get("https://data.wago.io/api/raw/encoded", {
      params: {
        // eslint-disable-next-line no-underscore-dangle
        id: slug,
      },
      headers: {
        Identifier: accountHash,
        "api-key": wagoApiKey || "",
      },
      crossdomain: true,
    })
    .catch((err) => ({
      config: { params: { id: err.config.params.id } },
      status: err.response.status,
    }));
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

const getWagoData = async (
  addonConfigs,
  auraObject,
  globalSettings,
  accountHash
) => {
  const auras = Object.values(auraObject);
  let allAurasFetched = [];
  let received = [];
  const pendingPromisesWagoEncoded = [];

  addonConfigs.forEach(async (addonConf) => {
    const aurasToFetch = auras.reduce((accumulator, aura) => {
      if (
        aura.auraType === addonConf.addonName &&
        !(
          globalSettings.ignoreOwnAuras &&
          isOwnAura(aura, globalSettings.wagoUsername)
        )
      ) {
        accumulator.push(aura.slug);
      }
      return accumulator;
    }, []);

    if (aurasToFetch.length === 0) return;
    allAurasFetched = [...allAurasFetched, ...aurasToFetch];

    try {
      const { data: wagoAuras } = getAurasInfoFromWago(
        addonConf.wagoApi,
        aurasToFetch,
        accountHash,
        globalSettings.wagoApiKey
      );

      wagoAuras.forEach((wagoAura) => {
        received.push(wagoAura.slug);
        const aura = auraObject[wagoAura.slug];

        if (aura) {
          auraObject[wagoAura.slug] = updateAuraInfoFromWago(aura, wagoAura);
        }

        // Check if encoded string needs to be fetched
        if (needFetch({ aura, wagoAura, globalSettings })) {
          // push promise ?
          pendingPromisesWagoEncoded.push(
            getAuraRawEncoded(aura.slug, globalSettings.wagoApiKey)
          );

          auraObject[wagoAura.slug] = {
            ...aura,
            wagoVersion: wagoData.version,
          };
          // auraObject[wagoAura.slug].wagoVersion = wagoData.version;
          // aura.wagoVersion = wagoData.version
        }
      });
    } catch (err) {
      throw Error("app.main.errorWagoAnswer");
    }
  });
  const notReceived = allAurasFetched.filter((slug) => received.includes(slug));

  notReceived.forEach((slug) => {
    delete auraObject[slug];
    console.log(`no data received for ${slug}`);
  });

  return await Promise.all(pendingPromisesWagoEncoded);
};

const updateAurasEncodedString = async (wagoResponses, aurasMap, msg, tr) => {
  const news = [];
  const fails = [];

  wagoResponses.forEach((wagoResp) => {
    const { id } = wagoResp.config.params;
    const aura = aurasMap[id];

    if (wagoResp.status === 200) {
      aurasMap[id] = { ...aura[id], encoded: wagoResp.data };
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
};

const createCacheKey = (version, account) => {
  return `${version}:${account}`;
};

/*
TODO: Set auras in an object, the key is version:account
So it would be only one level depth
then one level for slugs

need to create a migrate tool for that, shouldn't be too hard ?
access that object with a computed prop key ?
*/

const createCompanionToc = (addonPath, addonDependencies) => {
  const toc =
    addonPath.toLowerCase().search("classic") === -1 ? "90001" : "11305";
  return {
    name: "WeakAurasCompanion.toc",
    data: `## Interface: ${toc}
## Title: WeakAuras Companion
## Author: The WeakAuras Team
## Version: 1.1.0
## Notes: Keep your WeakAuras updated!
## X-Category: Interface Enhancements
## DefaultState: Enabled
## LoadOnDemand: 0
## OptionalDeps: ${addonDependencies}

data.lua
init.lua`,
  };
};

const createLuaInit = () => {
  return {
    name: "init.lua",
    data: `-- file generated automatically
local buildTimeTarget = 20190123023201
local waBuildTime = tonumber(WeakAuras and WeakAuras.buildTime or 0)

if waBuildTime and waBuildTime > buildTimeTarget then
  local loadedFrame = CreateFrame("FRAME")
  loadedFrame:RegisterEvent("ADDON_LOADED")
  loadedFrame:SetScript("OnEvent", function(_, _, addonName)
    if addonName == "WeakAurasCompanion" then
      local count = WeakAuras.CountWagoUpdates()
      if count and count > 0 then
        WeakAuras.prettyPrint(WeakAuras.L["There are %i updates to your auras ready to be installed!"]:format(count))
      end
      if WeakAuras.ImportHistory then
        for id, data in pairs(WeakAurasSaved.displays) do
          if data.uid and not WeakAurasSaved.history[data.uid] then
            local slug = WeakAurasCompanion.uids[data.uid]
            if slug then
              local wagoData = WeakAurasCompanion.slugs[slug]
              if wagoData and wagoData.encoded then
                WeakAuras.ImportHistory(wagoData.encoded)
              end
            end
          end
        end
      end
      if WeakAurasCompanion.stash then
        local emptyStash = true
        for _ in pairs(WeakAurasCompanion.stash) do
          emptyStash = false
        end
        if not emptyStash and WeakAuras.StashShow then
          C_Timer.After(5, function() WeakAuras.StashShow() end)
        end
      end
    end
  end)
end

if Plater and Plater.CheckWagoUpdates then
    Plater.CheckWagoUpdates()
end`,
  };
};

const createLuaData = (luaOutput) => {
  return {
    name: "data.lua",
    data: `-- file generated automatically
WeakAurasCompanion = {
${luaOutput}}`,
  };
};

const LUA_FIELDS = ["name", "author", "encoded", "wagoVersion", "wagoSemver"];

const encodeSlugDataAura = (aura, spacing) => {
  let luaSlug = "";
  luaSlug += spacing + `    ["${aura.slug.replace(/"/g, '\\"')}"] = {\n`;

  LUA_FIELDS.forEach((field) => {
    luaSlug += spacing + `      ${field} = [=[${aura[field]}]=],\n`;
  });

  if (aura.changelog !== undefined) {
    if (aura.changelog.text !== undefined) {
      let sanitized = sanitize[aura.changelog.format]
        ? sanitize[[aura.changelog.format]](aura.changelog.text)
        : "";

      luaSlug += spacing + `      versionNote = [=[${sanitized}]=],\n`;
    }
  }
  luaSlug += spacing + "    },\n";

  return luaSlug;
};

const encodeAurasData = (auras, spacing) => {
  let luaSlugs = spacing + "  slugs = {\n";
  let luaUids = spacing + "  uids = {\n";
  let luaIds = spacing + "  ids = {\n";

  auras.forEach((aura) => {
    luaSlugs += encodeSlugDataAura(aura, spacing);

    if (aura.uids && aura.ids) {
      aura.uids.forEach((uid) => {
        if (uid) {
          luaUids +=
            spacing +
            `    ["${uid.replace(/"/g, '\\"')}"] = [=[${aura.slug}]=],\n`;
        }
      });

      aura.ids.forEach((id) => {
        if (id) {
          luaIds +=
            spacing +
            `    ["${id.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"] = [=[${
              aura.slug
            }]=],\n`;
        }
      });
    }
  });
  luaSlugs += spacing + "  },\n";
  luaUids += spacing + "  },\n";
  luaIds += spacing + "  },\n";

  return { luaSlugs, luaUids, luaIds };
};

const encodeStashData = (stash, spacing, addonName) => {
  let luaStash = spacing + "  stash = {\n";

  stash
    .filter((aura) => aura.auraType === addonName)
    .forEach((aura) => {
      luaStash += encodeSlugDataAura(aura);
    });
  luaStash += spacing + "  },\n";

  return luaStash;
};

const wrapWithDataIndex = (luaOutput, dataIndex) => {
  return `  ${dataIndex} = {
${luaOutput}  },\n`;
};

const createAurasLua = (auras, stash, addonInstalled) => {
  if (!this.config.wowpath.valided || !this.version !== "") return;
  const baseAddonFolder = path.join(
    this.config.wowpath.value,
    this.config.wowpath.version
  );

  const addonFolder = syncGetAddonFolder(
    baseAddonFolder,
    "WeakAurasCompanion",
    true
  );

  if (addonFolder == null) throw new Error("errorCantCreateAddon");

  let addonDependencies = "";

  const luaOutput = addonInstalled.reduce((output, config) => {
    addonDependencies += config.addonName + ",";
    let luaAddonOutput = "";

    let spacing = config.dataIndex ? "  " : "";

    // const auras = this.aurasByAddon?[config.addonName]
    const { luaSlugs, luaUids, luaIds } = encodeAurasData(auras, spacing);

    luaAddonOutput += luaSlugs;
    luaAddonOutput += luaUids;
    luaAddonOutput += luaIds;

    luaAddonOutput += encodeStashData(stash, spacing, config.addonName);

    if (config.dataIndex) {
      luaAddonOutput = wrapWithDataIndex(luaAddonOutput, config.dataIndex);
    }
    output += luaAddonOutput;
    return output;
  }, "");

  const files = [
    createCompanionToc(addonFolder, addonDependencies),
    createLuaInit(),
    createLuaData(luaOutput),
  ];

  return files;
};

const writeAddonFiles = async (files) => {
  let newInstall = false;

  files.forEach((file) => {
    let filepath = path.join(AddonFolder, file.name);

    // beware here ? not sure about existsSync
    if (!fs.existsSync(filepath)) {
      newInstall = true;
    }

    // this error needs to be caught inside the component, this file will be in wowscan or something like that. copy the error block in component
    try {
      fs.writeFile(filepath, file.data);
    } catch (err) {
      this.message(
        this.$t(
          "app.main.errorFileSave",
          { file: file.name } /* {file} could not be saved */
        ),
        "error"
      );
      throw new Error("errorFileSave");
    }
  });
  return newInstall;
};

// need to refactor this one up, gonna take a while and then work is mostly done. is it better? no idea honestly
async function writeAddonData(news, fails, noNotification) {
  let newInstall = false;

  const addonConfigs = this.addonsInstalled;

  if (!this.config.wowpath.valided || !this.version !== "") return;
  const baseAddonFolder = path.join(
    this.config.wowpath.value,
    this.config.wowpath.version
  );

  var AddonFolder = syncGetAddonFolder(
    baseAddonFolder,
    "WeakAurasCompanion",
    true
  );

  if (AddonFolder == null) throw new Error("errorCantCreateAddon");

  // Make data.lua
  let LuaOutput = "-- file generated automatically\n";
  LuaOutput += "WeakAurasCompanion = {\n";
  let addonDepts = "";
  const fields = ["name", "author", "encoded", "wagoVersion", "wagoSemver"];

  addonConfigs.forEach((config) => {
    addonDepts += config.addonName + ",";

    let spacing = "";

    if (config.dataIndex) {
      LuaOutput += `  ${config.dataIndex} = {\n`;
      spacing = "  ";
    }

    let LuaSlugs = spacing + "  slugs = {\n";
    let LuaUids = spacing + "  uids = {\n";
    let LuaIds = spacing + "  ids = {\n";

    this.aurasWithData
      .filter((aura) => aura.auraType === config.addonName)
      .forEach((aura) => {
        LuaSlugs += spacing + `    ["${aura.slug.replace(/"/g, '\\"')}"] = {\n`;

        fields.forEach((field) => {
          LuaSlugs += spacing + `      ${field} = [=[${aura[field]}]=],\n`;
        });

        if (typeof aura.changelog !== "undefined") {
          if (typeof aura.changelog.text !== "undefined") {
            let sanitized;

            if (aura.changelog.format === "bbcode") {
              sanitized = sanitize.bbcode(aura.changelog.text);
            } else if (aura.changelog.format === "markdown") {
              sanitized = sanitize.markdown(aura.changelog.text);
            }

            LuaSlugs += spacing + `      versionNote = [=[${sanitized}]=],\n`;
          }
        }
        LuaSlugs += spacing + "    },\n";

        if (aura.uids && aura.ids) {
          aura.uids.forEach((uid) => {
            if (uid) {
              LuaUids +=
                spacing +
                `    ["${uid.replace(/"/g, '\\"')}"] = [=[${aura.slug}]=],\n`;
            }
          });

          aura.ids.forEach((id) => {
            if (id) {
              LuaIds +=
                spacing +
                `    ["${id
                  .replace(/\\/g, "\\\\")
                  .replace(/"/g, '\\"')}"] = [=[${aura.slug}]=],\n`;
            }
          });
        }
      });
    LuaOutput += LuaSlugs;
    LuaOutput += spacing + "  },\n";
    LuaOutput += LuaUids;
    LuaOutput += spacing + "  },\n";
    LuaOutput += LuaIds;
    LuaOutput += spacing + "  },\n";
    LuaOutput += spacing + "  stash = {\n";

    this.stash
      .filter((aura) => aura.auraType === config.addonName)
      .forEach((aura) => {
        LuaOutput +=
          spacing + `    ["${aura.slug.replace(/"/g, '\\"')}"] = {\n`;

        fields.forEach((field) => {
          LuaOutput += spacing + `      ${field} = [=[${aura[field]}]=],\n`;
        });

        if (typeof aura.changelog !== "undefined") {
          if (typeof aura.changelog.text !== "undefined") {
            let sanitized;

            if (aura.changelog.format === "bbcode") {
              sanitized = sanitize.bbcode(aura.changelog.text);
            } else if (aura.changelog.format === "markdown") {
              sanitized = sanitize.markdown(aura.changelog.text);
            }

            LuaOutput += spacing + `      versionNote = [=[${sanitized}]=],\n`;
          }
        }
        LuaOutput += spacing + "    },\n";
      });
    LuaOutput += spacing + "  },\n";

    if (config.dataIndex) {
      LuaOutput += "  },\n";
    }
  });
  LuaOutput += "}";

  /* if (this.stash.lenghth > 0) { LuaOutput += "" } */
  const toc =
    AddonFolder.toLowerCase().search("classic") === -1 ? "90001" : "11305";
  const files = [
    {
      name: "WeakAurasCompanion.toc",
      data: `## Interface: ${toc}
## Title: WeakAuras Companion
## Author: The WeakAuras Team
## Version: 1.1.0
## Notes: Keep your WeakAuras updated!
## X-Category: Interface Enhancements
## DefaultState: Enabled
## LoadOnDemand: 0
## OptionalDeps: ${addonDepts}

data.lua
init.lua`,
    },
    {
      name: "init.lua",
      data: `-- file generated automatically
local buildTimeTarget = 20190123023201
local waBuildTime = tonumber(WeakAuras and WeakAuras.buildTime or 0)

if waBuildTime and waBuildTime > buildTimeTarget then
  local loadedFrame = CreateFrame("FRAME")
  loadedFrame:RegisterEvent("ADDON_LOADED")
  loadedFrame:SetScript("OnEvent", function(_, _, addonName)
    if addonName == "WeakAurasCompanion" then
      local count = WeakAuras.CountWagoUpdates()
      if count and count > 0 then
        WeakAuras.prettyPrint(WeakAuras.L["There are %i updates to your auras ready to be installed!"]:format(count))
      end
      if WeakAuras.ImportHistory then
        for id, data in pairs(WeakAurasSaved.displays) do
          if data.uid and not WeakAurasSaved.history[data.uid] then
            local slug = WeakAurasCompanion.uids[data.uid]
            if slug then
              local wagoData = WeakAurasCompanion.slugs[slug]
              if wagoData and wagoData.encoded then
                WeakAuras.ImportHistory(wagoData.encoded)
              end
            end
          end
        end
      end
      if WeakAurasCompanion.stash then
        local emptyStash = true
        for _ in pairs(WeakAurasCompanion.stash) do
          emptyStash = false
        end
        if not emptyStash and WeakAuras.StashShow then
          C_Timer.After(5, function() WeakAuras.StashShow() end)
        end
      end
    end
  end)
end

if Plater and Plater.CheckWagoUpdates then
    Plater.CheckWagoUpdates()
end`,
    },
    {
      name: "data.lua",
      data: LuaOutput,
    },
  ];

  files.forEach((file) => {
    let filepath = path.join(AddonFolder, file.name);

    if (!fs.existsSync(filepath)) {
      newInstall = true;
    }

    fs.writeFile(filepath, file.data, (err2) => {
      if (err2) {
        this.message(
          this.$t(
            "app.main.errorFileSave",
            { file: file.name } /* {file} could not be saved */
          ),
          "error"
        );
        throw new Error("errorFileSave");
      }
    });
  });

  // TODO HERE!!!!
  if (!noNotification) this.afterUpdateNotification(newInstall, news, fails);

  if (
    newInstall &&
    isWOWOpen(this.config.wowpath.value, this.config.wowpath.version)
  ) {
    if (!this.reloadToast) {
      this.reloadToast = this.message(
        this.$t(
          "app.main.needrestart" /* Restart World of Warcraft to see new updates in WeakAuras's options */
        ),
        "info",
        {
          duration: null,
          onComplete: () => {
            this.reloadToast = null;
          },
        }
      );

      afterWOWRestart(
        this.config.wowpath.value,
        this.config.wowpath.version,
        () => {
          if (this.reloadToast) this.reloadToast.goAway(0);
        }
      );
    }
  }

  this.backup();
}
