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

const organizeAurasBySlug = (parsedAddonData) => {
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

const isTopLevel = (aura) => !!aura.topLevel || aura.regionType !== "group";

const wagoVersionIsSuperior = (aura, wagoAura) => {
  return wagoAura.version > aura.version && wagoAura.version > aura.wagoVersion;
};

const isOwnAura = (aura, username) => {
  return !!aura.author && aura.author === username;
};

const ignoringOwnAuras = (aura, { ignoreOwnAuras, wagoUsername }) => {
  return !ignoreOwnAuras || !isOwnAura(aura, wagoUsername);
};

const hasUpdate = (aura) => {
  return aura.wagoVersion > aura.version && !aura.ignoreWagoUpdate;
};

const auraShouldUpdate = ({ aura, wagoAura, config }) => {
  return (
    !aura.ignoreWagoUpdate &&
    isTopLevel(aura) &&
    !ignoreOwnAuras(aura, config) &&
    (aura.encoded === null || wagoVersionIsSuperior(aura, wagoAura))
  );
};

export default {
  organizeAurasBySlug,
  mergeAuraInfoFromWago,
  ignoringOwnAuras,
  hasUpdate,
  auraShouldUpdate,
};
