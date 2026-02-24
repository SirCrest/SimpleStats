import { action } from "@elgato/streamdeck";
import { BaseMetricAction, type MetricGroup } from "./base-metric";

@action({ UUID: "com.crest.simplestats.memory" })
export class MemoryAction extends BaseMetricAction {
  protected override getDeviceGroup(): MetricGroup { return "memory"; }
}
