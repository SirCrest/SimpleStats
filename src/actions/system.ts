import { action } from "@elgato/streamdeck";
import { BaseMetricAction, type MetricGroup } from "./base-metric";

@action({ UUID: "com.crest.simplestats.system" })
export class SystemAction extends BaseMetricAction {
  protected override getDeviceGroup(): MetricGroup { return "system"; }
}
