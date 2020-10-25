const luaparse = require("luaparse");
import ParserFactory from "./addon-parser";
import { getAddonLuaFilePath } from "./wowscan";
import axios from "axios";

axios.defaults.timeout = 15000;

const mergeAllSavedVariablesData = (addonConfigs, message) => {
  const configWithPathAndParser = addonConfigs
    .map((addonConf) => {
      return {
        parser: ParserFactory.get(addonConf.name),
        path: getAddonLuaFilePath(addonConf.name),
      };
    })
    .filter((conf) => conf.parser && conf.path);

  return configWithPathAndParser.reduce((acc, conf) => {
    try {
      const data = fs.readFileSync(conf.path, "utf-8");
      // Parse saved data .lua
      const savedData = luaparse.parse(data);
      acc.push(conf.parser(savedData));
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
  return [Object.keys(auraMappedBySlug), auraMappedBySlug];
};

const buildAuraList = (parsedAddonData) => {
  const [slugs, mergedParsed] = joinBySlug(parsedAddonData);
  // console log ?
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

const getWagoData = async (
  addonConfigs,
  slugs,
  auraObject,
  globalSettings,
  accountHash,
  message
) => {
  const auras = Object.values(auraObject);
  let allAurasFetched = [];
  let received = [];
  const pendingPromisesWagoEncoded = [];

  addonConfigs.forEach(async (addonConf) => {
    const aurasToFetch = auras.reduce((accumulator, aura) => {
      if (
        !(
          globalSettings.ignoreOwnAuras &&
          !!aura.author &&
          aura.author === globalSettings.wagoUsername
        ) &&
        aura.auraType === config.addonName
      ) {
        accumulator.push(aura.slug);
      }
      return accumulator;
    }, []);

    if (aurasToFetch.length === 0) return;
    allAurasFetched = [...allAurasFetched, ...aurasToFetch];

    try {
      const { data } = await axios.get(addonConf.wagoAPI, {
        params: {
          // !! size of request is not checked, can lead to too long urls
          ids: fetchAuras.join(),
        },
        headers: {
          Identifier: accountHash,
          "api-key": globalSettings.wagoApiKey || "",
        },
        crossdomain: true,
      });

      data.forEach((wagoAura) => {
        received.push(wagoAura._id, wagoAura.slug);
        const aura = auraObject[wagoAura.slug];

        if (aura) {
          auraObject[wagoAura.slug] = updateAuraInfoFromWago(aura, wagoAura);
        }

        // Check if encoded string needs to be fetched
        if (
          !aura.ignoreWagoUpdate &&
          (aura.topLevel || aura.regionType !== "group") &&
          (aura.encoded === null ||
            (wagoAura.version > aura.version &&
              !!aura.wagoVersion &&
              wagoAura.version > aura.wagoVersion)) &&
          !(
            globalSettings.ignoreOwnAuras &&
            wagoAura.username === globalSettings.wagoUsername
          )
        ) {
          // push promise ?
          pendingPromisesWagoEncoded.push(
            axios
              .get("https://data.wago.io/api/raw/encoded", {
                params: {
                  // eslint-disable-next-line no-underscore-dangle
                  id: wagoAura.slug,
                },
                headers: {
                  Identifier: accountHash,
                  "api-key": globalSettings.wagoApiKey || "",
                },
                crossdomain: true,
              })
              .catch((err) => ({
                config: { params: { id: err.config.params.id } },
                status: err.response.status,
              }))
          );
        }
      });
    } catch (err) {
      throw Error("app.main.errorWagoAnswer");
    }
  });

  return { pending: pendingPromisesWagoEncoded, received, allAurasFetched };
};

const updateAurasString = async (pendingPromises, aurasMap) => {
  const news = [];
  const fails = [];
  const wagoResponses = await Promise.all(pendingPromises);

  wagoResponses.forEach((wagoResp) => {
    const { id } = wagoResp.config.params;
    const aura = aurasMap[id];

    if (wagoResp.status === 200) {
      aurasMap[id] = { ...aura[id], encoded: wagoResp.data };
      news.push(aura.name);
    } else {
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
