const luaparse = require("luaparse");

luaparse.defaultOptions.comments = false;
luaparse.defaultOptions.scope = true;

export default luaparse;
