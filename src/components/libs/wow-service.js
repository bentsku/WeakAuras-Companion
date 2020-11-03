const fs = require("fs");
const regedit = require("regedit");
// const fsasync = require("fs/promises");

if (process.platform === "win32") {
  regedit.setExternalVBSLocation("resources/node_modules/regedit/vbs");
}

const wowPath = "";

function syncMatchFolderContentInsensitive(folder, name, create) {
  try {
    const files = fs.readdirSync(folder);

    if (files === undefined) throw Error(`Folder ${folder} doesnt exist`);

    const folderFound = files.find(
      (filename) => filename.toLowerCase() === name.toLowerCase()
    );

    if (folderFound) return folderFound;

    if (!!create) {
      try {
        fs.mkdirSync(path.join(folder, name));
      } catch (err) {
        if (err && err.code !== "EEXIST") {
          console.log(JSON.stringify(err));
          throw new Error("errorCantCreateAddon");
        }
      }
      return name;
    }
  } catch (err) {
    console.log(err);
    throw Error(`${name} not found at ${folder}`);
  }
}

function syncGetAddonFolder(version, addonName, create = false) {
  let addonFolder = path.join(wowPath, version);
  const addonPath = ["Interface", "AddOns", addonName];

  while (addonPath.length) {
    const check = addonPath.shift();

    try {
      var folder = syncMatchFolderContentInsensitive(
        addonFolder,
        check,
        create
      );

      if (folder) addonFolder = path.join(addonFolder, folder);
      else return null;
    } catch (err) {
      console.log(err);
      return null;
    }
  }

  return addonFolder;
}

export const getWowDefaultPath = async () => {
  const defaultPathPromise = new Promise((resolve) => {
    if (process.platform === "win32") {
      const key =
        "HKLM\\SOFTWARE\\WOW6432Node\\Blizzard Entertainment\\World of Warcraft";

      regedit.list(key, (err, result) => {
        if (err) throw err;
        else {
          resolve(path.join(result[key].values.InstallPath.value, ".."));
        }
      });
    } else {
      resolve("");
    }
  });
  return await defaultPathPromise;
};

export const setWowPath = (newWowPath) => {
  if (newWowPath === wowPath) return wowPath;

  const DataFolder = path.join(newWowPath, "Data");

  try {
    fs.accessSync(DataFolder);
  } catch (err) {
    console.log(`Error: ${err}`);
    wowPath = "";
    return wowPath;
  }
  const versions = getVersions();

  // check if at least one version has an account that is valid
  if (versions.length > 0) {
    wowPath = newWowPath;
    return newWowPath;
  } else {
    wowPath = "";
    return "";
  }
};

const getAccountFolder = (wowDir, versionDir) => {
  return path.join(wowDir, versionDir, "WTF", "Account");
};

export const getVersions = (wowDir = wowPath) => {
  try {
    const files = fs.readdirSync(wowDir);

    return files.filter((versionDir) => {
      if (
        versionDir.match(/^_.*_$/) &&
        fs.statSync(path.join(wowDir, versionDir)).isDirectory()
      ) {
        const accountFolder = getAccountFolder(wowDir, versionDir);
        return fs.existsSync(accountFolder);
      }
    });
  } catch {
    return [];
  }
};

export const getAccounts = (version) => {
  const accountsFolder = getAccountFolder(wowPath, version);

  try {
    const accountFolders = fs.readdirSync(accountsFolder);

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

export const getSavedVariablesFile = ({ version, account, addon }) => {
  const accountFolder = getAccountFolder(wowPath, version);
  let addonSavedVariablesLuaFile = path.join(
    accountFolder,
    account,
    "SavedVariables",
    `${addon}.lua`
  );

  try {
    return fs.readFileSync(addonSavedVariablesLuaFile);
  } catch (e) {
    return null;
  }
};

export const isAddonInstalled = (version, addon) => {
  return syncGetAddonFolder(version, addon);
};

export const checkOrCreateCompanionFolder = (version) => {
  return syncGetAddonFolder(version, "WeakAurasCompanion", true);
};

export const writeCompanionData = (files) => {
  let newInstall = false;

  files.forEach((file) => {
    let filepath = path.join(AddonFolder, file.name);

    // beware here ? not sure about existsSync
    if (!fs.existsSync(filepath)) {
      newInstall = true;
    }

    try {
      fs.writeFileSync(filepath, file.data);
    } catch (err) {
      // catch this in component
      // this.message(
      //   this.$t(
      //     "app.main.errorFileSave",
      //     { file: file.name } /* {file} could not be saved */
      //   ),
      //   "error"
      // );
      throw new Error("errorFileSave");
    }
  });
  return newInstall;
};

export default {
  getWowDefaultPath,
  setWowPath,
  getVersions,
  getAccounts,
  getSavedVariablesFile,
  isAddonInstalled,
  checkOrCreateCompanionFolder,
  writeCompanionData,
};
