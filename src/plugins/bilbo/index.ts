import type { WorkoutPlugin } from "../types";
import { parseBilboConfig } from "./config";
import { bilboOnSessionCompleted } from "./onSessionCompleted";
import { BilboSessionExtras } from "./SessionExtras";

export const bilboPlugin: WorkoutPlugin = {
  key: "bilbo",
  name: "BILBO",
  parseConfig: parseBilboConfig,
  SessionExtras: BilboSessionExtras,
  onSessionCompleted: bilboOnSessionCompleted,
};
