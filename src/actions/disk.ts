import { action } from "@elgato/streamdeck";
import { BaseMetricAction, type MetricGroup } from "./base-metric";

@action({ UUID: "com.crest.simplestats.disk" })
export class DiskAction extends BaseMetricAction {
  protected override getDeviceGroup(): MetricGroup { return "disk"; }
}
