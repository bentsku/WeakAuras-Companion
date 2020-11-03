const fs = require("fs");
const fsasync = require("fs/promises");
const wowpathTest = "/Users/benjaminsimon/Projects/Random/weakauras-dummy/WoW";

const isWowFolderValid = (wowPath) => {
  const DataFolder = path.join(wowPath, "Data");

  try {
    // test if ${wowpath}\Data exists
    fs.accessSync(DataFolder);
    const files = fs.readdirSync(wowpath);

    return files
      .filter(
        (versionDir) =>
          versionDir.match(/^_.*_$/) &&
          fs.statSync(path.join(wowpath, versionDir)).isDirectory()
      )
      .every((versionDir) => {
        const accountFolder = path.join(wowpath, versionDir, "WTF", "Account");
        return fs.accessSync(accountFolder, fs.constants.F_OK) === undefined;
      });
  } catch (err) {
    console.log(`Error: ${err}`);
    return false;
  }
};

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
  } catch {
    return [];
  }
};

const asyncGetVersions = async (wowpath) => {
  try {
    const files = await fsasync.readdir(wowpath);

    return files.filter(async (versionDir) => {
      if (
        versionDir.match(/^_.*_$/) &&
        (await fsasync.stat(path.join(wowpath, versionDir)).isDirectory())
      ) {
        const accountFolder = path.join(wowpath, versionDir, "WTF", "Account");
        return fs.existsSync(accountFolder);
      }
    });
  } catch {
    return [];
  }
};

const getAccounts = (wowpath, version) => {
  const accountsFolder = path.join(wowpath, version, "WTF", "Account");

  try {
    const accountFolders = fs.readdir(accountsFolder);

    return accountFolders.filter(
      (accountFile) =>
        accountFile !== "SavedVariables" &&
        fs.statSync(path.join(accountFolder, accountFile)).isDirectory()
    );
  } catch (err) {
    console.log(`Error: ${err}`);
    return [];
  }
};

export const getAddonLuaFilePath = ({ wowPath, version, account, addon }) => {
  let addonSavedVariablesLuaFile = path.join(
    wowPath,
    version,
    "WTF",
    "Account",
    account,
    "SavedVariables",
    `${addon}.lua`
  );

  try {
    fs.accessSync(addonSavedVariablesLuaFile, fs.constants.F_OK);
    return addonSavedVariablesLuaFile;
  } catch (e) {
    return "";
  }
};
