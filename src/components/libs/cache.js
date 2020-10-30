const Store = require("electron-store");

const store = new Store({
  name: "test",
});
const CONFIG = "config";
const AURAS = "auras";

const getKeyPath = (type, ...args) => {
  console.log(type, args);

  if (args.some((arg) => typeof arg !== "string"))
    throw Error("Wrong arg type");
  return `${type}.${args.join(".")}`;
};

const setCacheConfig = (configObject) => {
  store.set(CONFIG, configObject);
};

const setCacheAuras = (cacheKey, aurasObject) => {
  store.set(AURAS, cacheKey, aurasObject);
};

const clearCacheConfig = () => {
  store.delete(CONFIG);
};

const clearCacheAuras = () => {
  store.delete(AURAS);
};

const clearCacheKeyAuras = (cacheKey) => {
  const key = getKeyPath(AURAS, cacheKey);
  store.delete(key);
};

const getCacheAurasByKey = (cacheKey) => {
  const key = getKeyPath(AURAS, cacheKey);
  return store.get(key);
};

const getAllCachedAuras = () => {
  return store.get(AURAS);
};

const clearStore = () => {
  store.clear();
};

const setAura = (cacheKey, auraObject) => {
  const key = getKeyPath(AURAS, cacheKey, auraObject.slug);
  store.set(key, auraObject);
};

const deleteAura = (cacheKey, slug) => {
  const key = getKeyPath(AURAS, cacheKey, slug);
  store.delete(key);
};

const cleanUpAuraCache = (accountsObject) => {
  const userCacheKeys = Object.keys(accountsObject).reduce((acc, version) => {
    const versionCacheKeys = accountsObject[version].map(
      (account) => `${version}:${account}`
    );
    return [...acc, ...versionCacheKeys];
  }, []);
  const cachedKeys = Object.keys(getAllCachedAuras());

  cachedKeys.forEach((key) => {
    if (!userCacheKeys.includes(key)) {
      clearCacheKeyAuras(key);
    }
  });
};

export default {
  setCacheAuras,
  setCacheConfig,
  clearCacheAuras,
  clearCacheKeyAuras,
  clearCacheConfig,
  clearStore,
  setAura,
  deleteAura,
  getCacheAurasByKey,
  getAllCachedAuras,
  cleanUpAuraCache,
};
