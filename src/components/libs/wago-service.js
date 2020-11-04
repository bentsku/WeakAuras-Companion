import axios from "axios";

const baseDomain = "https://data.wago.io";
const baseURL = `${baseDomain}/api`;
// UTILS OUT !!!

function chunk(array, size) {
  const length = array.length;

  if (!length || size < 1) return [];

  const chunkAmount = Math.ceil(length / size);
  const chunks = Array(chunkAmount);
  let index = 0;
  let resIndex = 0;

  while (index < length) {
    chunks[resIndex++] = array.slice(index, (index += size));
  }
  return chunks;
}

const APIClient = axios.create({
  baseURL,
  headers: {
    "api-key": "",
    Identifier: "",
  },
  crossdomain: true,
  timeout: 15000,
});

export function setIdentifierHeader(accountHash) {
  APIClient.defaults.headers["Identifier"] = accountHash;
}

export function setWagoApiKeyHeader(wagoApiKey) {
  APIClient.defaults.headers["Identifier"] = wagoApiKey;
}

export function deleteWagoApiKeyHeader() {
  APIClient.defaults.headers["api-key"] = "";
}

export function getRawEncodedString(slug) {
  return APIClient.get("/raw/encoded", {
    params: {
      id: slug,
    },
  });
}

export function getAurasInfos(addon, slugs) {
  if (slugs.length > 100) return mergeRequests(addon, slugs);
  return APIClient.get(`/check/${addon}`, {
    params: {
      // !! size of request is not checked, can lead to too long urls
      ids: slugs.join(),
    },
  });
}

export function mergeRequests(addon, slugs) {
  const chunkSize = 100;
  const chunks = chunk(slugs, chunkSize);

  const promises = chunks.map((slugsChunk) => getAurasInfos(addon, slugsChunk));

  const merge = async () => {
    const wagoResponses = await Promise.all(promises);
    return wagoResponses.reduce((acc, responses) => {
      acc.push(...responses);
      return acc;
    }, []);
  };
  return merge();
}

export default {
  setIdentifierHeader,
  setWagoApiKeyHeader,
  deleteWagoApiKeyHeader,
  getRawEncodedString,
  getAurasInfos,
};
