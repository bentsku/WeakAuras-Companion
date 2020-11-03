import axios from "axios";

const baseDomain = "https://data.wago.io";
const baseURL = `${baseDomain}/api`;

const APIClient = axios.create({
  baseURL,
  headers: {
    "api-key": "",
    Identifier: "",
  },
  crossdomain: true,
  timeout: 15000,
});

function setIdentifierHeader(accountHash) {
  APIClient.defaults.headers["Identifier"] = accountHash;
}

function setWagoApiKeyHeader(wagoApiKey) {
  APIClient.defaults.headers["Identifier"] = wagoApiKey;
}

function deleteWagoApiKeyHeader() {
  APIClient.defaults.headers["api-key"] = "";
}

function getRawEncodedString(slug) {
  return APIClient.get("/raw/encoded", {
    params: {
      id: slug,
    },
  });
}

function getAurasInfos(addon, slugs) {
  if (addon.length > 100) return mergeRequests(addon, slugs);
  return APIClient.get(`/check/${addon}`, {
    params: {
      // !! size of request is not checked, can lead to too long urls
      ids: slugs.join(),
    },
  });
}

function mergeRequests(addon, slugs) {
  const chunkSize = 100;
  const chunks = slugs.map((_, i) =>
    slugs.slice(i * chunkSize, i * chunkSize + chunkSize)
  );

  const promises = chunks.map((chunk) => getAurasInfos(addon, chunk));

  const merge = async () => {
    const wagoResponses = await Promise.all(promises);
    return wagoResponses.reduce((acc, responses) => {
      acc.push(...responses);
      return acc;
    }, []);
  };
  return merge;
}

export default {
  setIdentifierHeader,
  setWagoApiKeyHeader,
  deleteWagoApiKeyHeader,
  getRawEncodedString,
  getAurasInfos,
};
