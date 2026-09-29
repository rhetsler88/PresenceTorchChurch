/**
 * `npx cap sync` only lists npm Capacitor plugins in iOS packageClassList.
 * Re-add App-target plugins so NSClassFromString can load them too.
 */
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = join(root, "ios/App/App/capacitor.config.json");
const LOCAL_IOS_PLUGINS = [
  "SessionGuardPlugin",
  "HeadsetPTTPlugin",
  "BackgroundAudioPlugin",
  "NativeVoiceProcessingPlugin",
  "PttTonesPlugin",
  "BlePttCentralPlugin",
];

const config = JSON.parse(readFileSync(configPath, "utf8"));
config.packageClassList = [...new Set([...(config.packageClassList || []), ...LOCAL_IOS_PLUGINS])];
writeFileSync(configPath, `${JSON.stringify(config, null, "\t")}\n`);
