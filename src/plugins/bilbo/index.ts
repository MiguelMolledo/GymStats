import type { WorkoutPlugin } from "../types";
import { parseBilboConfig } from "./config";
import { BilboCyclesView } from "./CyclesView";
import { BilboDashboard } from "./Dashboard";
import { bilboOnSessionCompleted } from "./onSessionCompleted";
import { BilboSessionExtras } from "./SessionExtras";

export const bilboPlugin: WorkoutPlugin = {
  key: "bilbo",
  name: "BILBO",
  parseConfig: parseBilboConfig,
  SessionExtras: BilboSessionExtras,
  onSessionCompleted: bilboOnSessionCompleted,
  Dashboard: BilboDashboard,
  ExtraViews: [
    {
      slug: "ciclos",
      label: "Ciclos",
      icon: "Repeat",
      Component: BilboCyclesView,
    },
  ],
};
