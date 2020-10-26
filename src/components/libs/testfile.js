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
        !(
          globalSettings.ignoreOwnAuras &&
          !!aura.author &&
          aura.author === globalSettings.wagoUsername
        ) &&
        aura.auraType === addonConf.addonName
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

  return pendingPromisesWagoEncoded;
};

const updateAurasEncodedString = async (pendingPromises, aurasMap, msg, tr) => {
  const news = [];
  const fails = [];
  const wagoResponses = await Promise.all(pendingPromises);

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
