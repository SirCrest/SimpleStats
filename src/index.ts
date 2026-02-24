import streamDeck from "@elgato/streamdeck";
import { CpuAction } from "./actions/cpu";
import { GpuAction } from "./actions/gpu";
import { MemoryAction } from "./actions/memory";
import { DiskAction } from "./actions/disk";
import { NetworkAction } from "./actions/network";
import { SystemAction } from "./actions/system";

streamDeck.actions.registerAction(new CpuAction());
streamDeck.actions.registerAction(new GpuAction());
streamDeck.actions.registerAction(new MemoryAction());
streamDeck.actions.registerAction(new DiskAction());
streamDeck.actions.registerAction(new NetworkAction());
streamDeck.actions.registerAction(new SystemAction());

streamDeck.connect();
