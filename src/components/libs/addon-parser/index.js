// addon parsing function here ?

import WeakAurasParser from "./weakauras.js";
import PlaterParser from "./plater.js";

const parser = {
  WeakAuras: WeakAurasParser,
  Plater: PlaterParser,
};

export const ParserFactory = {
  get: (name) => parser[name],
};
