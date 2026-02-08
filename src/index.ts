import streamDeck from "@elgato/streamdeck";
import {
  MetricAction,
  LegacyStatAction,
  LegacyCpuAction,
  LegacyGpuAction,
  LegacyGpuTempAction,
  LegacyMemoryAction,
  LegacyDiskAction,
  LegacyNetworkAction
} from "./actions/metric";

streamDeck.actions.registerAction(new MetricAction());
streamDeck.actions.registerAction(new LegacyStatAction());
streamDeck.actions.registerAction(new LegacyCpuAction());
streamDeck.actions.registerAction(new LegacyGpuAction());
streamDeck.actions.registerAction(new LegacyGpuTempAction());
streamDeck.actions.registerAction(new LegacyMemoryAction());
streamDeck.actions.registerAction(new LegacyDiskAction());
streamDeck.actions.registerAction(new LegacyNetworkAction());

streamDeck.connect();
